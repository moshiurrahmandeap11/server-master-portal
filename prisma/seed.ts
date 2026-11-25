import { prisma } from '../src/app/lib/prisma';

const CATEGORIES = [
  { id: 'cat-govt', slug: 'government-jobs', titleBn: 'সরকারি চাকরি', titleEn: 'Government Jobs', icon: 'Building2', description: 'বাংলাদেশ সিভিল সার্ভিস (বিসিএস), সকল মন্ত্রণালয়, অধিদপ্তর, পরিদপ্তর ও রাজস্ব খাতভুক্ত সরকারি নিয়োগ বিজ্ঞপ্তির সমন্বিত তালিকা।', orderIndex: 1 },
  { id: 'cat-govt-bcs', slug: 'bcs', titleBn: 'বিসিএস নিয়োগ (BCS)', titleEn: 'Bangladesh Civil Service (BCS)', icon: 'Award', description: 'বাংলাদেশ সরকারি কর্ম কমিশন (বিপিএসসি) পরিচালিত বিসিএস সাধারণ ও কারিগরি ক্যাডার নিয়োগ।', orderIndex: 1 },
  { id: 'cat-govt-ministry', slug: 'ministry-jobs', titleBn: 'মন্ত্রণালয় ও বিভাগীয় চাকরি', titleEn: 'Ministry Jobs', icon: 'Building', description: 'বিভিন্ন মন্ত্রণালয়, সচিবালয় ও প্রশাসনিক বিভাগের গ্রেড ও নন-ক্যাডার নিয়োগ।', orderIndex: 2 },
  { id: 'cat-govt-department', slug: 'directorate-jobs', titleBn: 'অধিদপ্তর ও পরিদপ্তর', titleEn: 'Government Department Jobs', icon: 'Landmark', description: 'এলজিইডি, পরিবার পরিকল্পনা, সমাজসেবা, কৃষি সম্প্রসারণসহ বিভিন্ন অধিদপ্তরের নিয়োগ।', orderIndex: 3 },
  { id: 'cat-govt-autonomous', slug: 'autonomous-jobs', titleBn: 'স্বায়ত্তশাসিত ও রাষ্ট্রীয় প্রতিষ্ঠান', titleEn: 'Autonomous Organization Jobs', icon: 'Building2', description: 'সিটি কর্পোরেশন, ওয়াসা, রাজউক, বিমান বাংলাদেশ ও রাষ্ট্রায়ত্ত প্রতিষ্ঠানের চাকরির বিজ্ঞপ্তি।', orderIndex: 4 },
  { id: 'cat-bank', slug: 'bank-jobs', titleBn: 'ব্যাংক চাকরি', titleEn: 'Bank Jobs', icon: 'Banknote', description: 'বাংলাদেশ ব্যাংক ও ব্যাংকার্স সিলেকশন কমিটি (বিএসসিএস) সহ সকল সরকারি ও বাণিজ্যিক ব্যাংকের নিয়োগ বিজ্ঞপ্তি।', orderIndex: 2 },
  { id: 'cat-bank-bb', slug: 'bangladesh-bank', titleBn: 'বাংলাদেশ ব্যাংক নিয়োগ', titleEn: 'Bangladesh Bank', icon: 'Coins', description: 'বাংলাদেশ ব্যাংকের সহকারী পরিচালক (AD), অফিসার ও আইটি পদের সরাসরি নিয়োগ।', orderIndex: 1 },
  { id: 'cat-bank-state', slug: 'state-owned-banks', titleBn: 'সমন্বিত রাষ্ট্রায়ত্ত ব্যাংক (BSCS)', titleEn: 'State-Owned Bank Jobs', icon: 'Layers', description: 'সোনালী, জনতা, অগ্রণী, রূপালী ও বিডিবিএল সমন্বিত অফিসার ও সিনিয়র অফিসার নিয়োগ।', orderIndex: 2 },
  { id: 'cat-bank-private', slug: 'private-bank-jobs', titleBn: 'বেসরকারি বাণিজ্যিক ব্যাংক', titleEn: 'Private Bank Jobs', icon: 'Briefcase', description: 'ব্র্যাক ব্যাংক, ইবিএল, সিটি ব্যাংক, ডাচ-বাংলাসহ সকল শীর্ষস্থানীয় প্রাইভেট ব্যাংকের ক্যারিয়ার।', orderIndex: 3 },
  { id: 'cat-private', slug: 'private-jobs', titleBn: 'বেসরকারি চাকরি', titleEn: 'Private Company Jobs', icon: 'Briefcase', description: 'দেশের শীর্ষস্থানীয় করপোরেট গ্রুপ, মাল্টিন্যাশনাল কোম্পানি ও স্টার্টআপের আকর্ষণীয় চাকরি।', orderIndex: 3 },
  { id: 'cat-ngo', slug: 'ngo-jobs', titleBn: 'এনজিও চাকরি', titleEn: 'NGO Jobs', icon: 'HeartHandshake', description: 'ব্র্যাক, আশা, টিএমএসএস ও আন্তর্জাতিক উন্নয়ন সংস্থার প্রকল্পভিত্তিক ও স্থায়ী ক্যারিয়ার।', orderIndex: 4 },
  { id: 'cat-teacher', slug: 'teacher-jobs', titleBn: 'শিক্ষা ও শিক্ষকতা', titleEn: 'Education & Teaching Jobs', icon: 'GraduationCap', description: 'সরকারি প্রাথমিক বিদ্যালয়, এনটিআরসিএ নিবন্ধন, কলেজ ও ক্যাডেট কলেজের শিক্ষক নিয়োগ।', orderIndex: 5 },
  { id: 'cat-health', slug: 'medical-jobs', titleBn: 'স্বাস্থ্য ও চিকিৎসা', titleEn: 'Healthcare & Medical Jobs', icon: 'Stethoscope', description: 'স্বাস্থ্য অধিদপ্তর (DGHS), সিনিয়র স্টাফ নার্স, মেডিকেল অফিসার ও ফার্মাসিউটিক্যাল ক্যারিয়ার।', orderIndex: 6 },
  { id: 'cat-it', slug: 'it-jobs', titleBn: 'আইটি ও সফটওয়্যার', titleEn: 'IT & Software Jobs', icon: 'Cpu', description: 'সফটওয়্যার ইঞ্জিনিয়ারিং, ওয়েব ডেভেলপমেন্ট, সাইবার সিকিউরিটি ও ডাটা এন্ট্রি ক্যারিয়ার।', orderIndex: 7 },
  { id: 'cat-engineer', slug: 'engineering-jobs', titleBn: 'ইঞ্জিনিয়ারিং', titleEn: 'Engineering Jobs', icon: 'Wrench', description: 'সিভিল, ইলেকট্রিক্যাল, মেকানিক্যাল, পাওয়ার গ্রিড ও উপ-সহকারী প্রকৌশলী পদের চাকরি।', orderIndex: 8 },
  { id: 'cat-defense', slug: 'defense-jobs', titleBn: 'প্রতিরক্ষা ও নিরাপত্তা', titleEn: 'Defense & Security Jobs', icon: 'ShieldCheck', description: 'বাংলাদেশ পুলিশ, সেনাবাহিনী, নৌবাহিনী, বিমানবাহিনী, বিজিবি ও আনসার-ভিডিপি নিয়োগ।', orderIndex: 9 },
  { id: 'cat-university', slug: 'university-jobs', titleBn: 'বিশ্ববিদ্যালয় চাকরি', titleEn: 'University Jobs', icon: 'BookOpen', description: 'পাবলিক ও বেসরকারি বিশ্ববিদ্যালয়ের প্রভাষক, সহকারী অধ্যাপক ও প্রশাসনিক কর্মকর্তা নিয়োগ।', orderIndex: 10 },
  { id: 'cat-school-college', slug: 'school-college-jobs', titleBn: 'স্কুল ও কলেজ চাকরি', titleEn: 'School & College Jobs', icon: 'GraduationCap', description: 'সরকারি ও এমপিওভুক্ত হাইস্কুল, মাদ্রাসা ও কলেজের শিক্ষক ও কর্মচারীর খবর।', orderIndex: 11 },
  { id: 'cat-finance', slug: 'finance-jobs', titleBn: 'ফাইন্যান্স ও ইন্স্যুরেন্স', titleEn: 'Finance & Insurance Jobs', icon: 'Coins', description: 'বীমা কোম্পানি, নন-ব্যাংক আর্থিক প্রতিষ্ঠান, অডিট ফার্ম ও অ্যাকাউন্টস পদের ক্যারিয়ার।', orderIndex: 12 },
  { id: 'cat-textile', slug: 'textile-jobs', titleBn: 'গার্মেন্টস ও টেক্সটাইল', titleEn: 'Garments & Textile Jobs', icon: 'Scissors', description: 'পোশাক শিল্প, স্পিনিং মিল, বায়িং হাউস ও মার্চেন্ডাইজিং খাতের পেশাজীবীদের সুযোগ।', orderIndex: 13 },
  { id: 'cat-telecom', slug: 'telecom-jobs', titleBn: 'টেলিকমিউনিকেশন', titleEn: 'Telecom Jobs', icon: 'PhoneCall', description: 'গ্রামীণফোন, রবি, বাংলালিংক, টেলিটক ও সাবমেরিন কেবল কোম্পানির টেকনিক্যাল জব।', orderIndex: 14 },
  { id: 'cat-agriculture', slug: 'agriculture-jobs', titleBn: 'কৃষি চাকরি', titleEn: 'Agriculture Jobs', icon: 'Wheat', description: 'কৃষি সম্প্রসারণ অধিদপ্তর (ডিএই), বিএডিসি, বারি ও কৃষি গবেষণা প্রতিষ্ঠানের চাকরির খবর।', orderIndex: 15 },
  { id: 'cat-development', slug: 'development-jobs', titleBn: 'উন্নয়ন সংস্থা', titleEn: 'Development Organization Jobs', icon: 'Globe2', description: 'জাতিসংঘ সহযোগী সংস্থা, ইউএসএইড ও দাতা সংস্থা পরিচালিত উন্নয়ন প্রকল্পের নিয়োগ।', orderIndex: 16 },
  { id: 'cat-international', slug: 'international-jobs', titleBn: 'আন্তর্জাতিক সংস্থা', titleEn: 'International Organization Jobs', icon: 'Plane', description: 'UNDP, UNICEF, WHO, ILO ও ঢাকায় অবস্থিত বিদেশি দূতাবাসগুলোর ক্যারিয়ার সুযোগ।', orderIndex: 17 },
  { id: 'cat-research', slug: 'research-jobs', titleBn: 'গবেষণা ও ফেলোশিপ', titleEn: 'Research & Fellowship Jobs', icon: 'Microscope', description: 'বিসিএসআইআর, পরমাণু শক্তি কমিশন ও বিভিন্ন গবেষণা প্রতিষ্ঠানের ফেলো ও বিজ্ঞানী নিয়োগ।', orderIndex: 18 },
  { id: 'cat-marketing', slug: 'marketing-jobs', titleBn: 'সেলস ও মার্কেটিং', titleEn: 'Sales & Marketing Jobs', icon: 'TrendingUp', description: 'এফএমসিজি, রিয়েল এস্টেট ও ব্র্যান্ডিং খাতের টেরিটরি অফিসার ও সেলস এক্সিকিউটিভ নিয়োগ।', orderIndex: 19 },
  { id: 'cat-other', slug: 'other-jobs', titleBn: 'অন্যান্য চাকরি', titleEn: 'Other Jobs', icon: 'Layers', description: 'অফিস সহায়ক, ড্রাইভার, নিরাপত্তা প্রহরীসহ বিভিন্ন বিশেষায়িত নিয়োগ বিজ্ঞপ্তিসমূহ।', orderIndex: 20 },
];

async function main() {
  console.log(`Seeding ${CATEGORIES.length} job categories into PostgreSQL...`);
  for (const cat of CATEGORIES) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: {
        slug: cat.slug,
        titleBn: cat.titleBn,
        titleEn: cat.titleEn,
        icon: cat.icon,
        description: cat.description,
        orderIndex: cat.orderIndex,
      },
      create: cat,
    });
  }
  console.log('Successfully seeded all job categories!');
}

main()
  .catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
