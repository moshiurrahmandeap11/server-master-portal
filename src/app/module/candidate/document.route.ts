import { Router } from 'express';
import { documentController } from './document.controller';
import { checkAuth } from '../../middleware/checkAuth';
import { documentUpload } from '../../utils/upload';

const router = Router();

router.use(checkAuth());

router.get('/', documentController.getDocuments);
router.post('/', documentUpload.single('file'), documentController.uploadDocument);
router.post('/upload-document', documentUpload.single('file'), documentController.uploadDocument);
router.delete('/', documentController.deleteDocument);
router.delete('/:id', documentController.deleteDocument);

export const documentRoutes = router;
