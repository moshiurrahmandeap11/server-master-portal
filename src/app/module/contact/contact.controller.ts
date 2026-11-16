import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';

export const contactController = {
  submitMessage: catchAsync(async (req: Request, res: Response) => {
    const { name, phone, email, subject, message, category } = req.body;

    if (!name || !phone || !message) {
      throw new AppError(status.BAD_REQUEST, 'নাম, মোবাইল নম্বর এবং বার্তার বিবরণ আবশ্যক।');
    }

    const ticketId = `TCK-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const fullSubject = subject || (category ? `[${category}] সাধারণ অনুসন্ধান` : 'সাধারণ অনুসন্ধান');

    const contact = await prisma.contactMessage.create({
      data: {
        id: ticketId,
        name: name.trim(),
        phone: phone.trim(),
        email: email ? email.trim().toLowerCase() : 'support@chakrisheba.com',
        subject: fullSubject,
        message: message.trim(),
        status: 'unread',
      },
    });

    return res.status(201).json({
      success: true,
      ticketId: contact.id,
      message: 'আপনার বার্তাটি সফলভাবে পাঠানো হয়েছে! আমাদের কাস্টমার সাপোর্ট দ্রুত যোগাযোগ করবে।',
      data: contact,
    });
  }),

  getMessagesOrTrack: catchAsync(async (req: Request, res: Response) => {
    const ticketId = (req.query.ticketId || req.query.id) as string | undefined;
    const phone = req.query.phone as string | undefined;

    if (ticketId) {
      const ticket = await prisma.contactMessage.findUnique({
        where: { id: ticketId.trim() },
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          error: 'এই টিকেট নম্বরের কোনো বার্তা বা অভিযোগ পাওয়া যায়নি।',
        });
      }

      return res.status(200).json({
        success: true,
        ticket,
        data: ticket,
      });
    }

    if (phone) {
      const messages = await prisma.contactMessage.findMany({
        where: { phone: phone.trim() },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        messages,
        data: messages,
      });
    }

    // Default list for admin or operator
    const messages = await prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return res.status(200).json({
      success: true,
      messages,
      data: messages,
    });
  }),
};
