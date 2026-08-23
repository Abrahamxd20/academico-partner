import express from 'express';
import { 
  upsertQuestion, 
  getQuestionsByReading, 
  getStudentProgressBySection, 
  exportProgressToExcel 
} from '../controllers/teacherController.js';

const router = express.Router();

router.post('/questions', upsertQuestion);
router.get('/questions/:lecturaId', getQuestionsByReading);
router.get('/progress/:seccion', getStudentProgressBySection);
router.get('/export-excel/:seccion', exportProgressToExcel);

export default router;