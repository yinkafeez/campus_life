import express from 'express';
import { getHealth, getReadiness } from './health.controller.js';

const router = express.Router();

router.get('/', getHealth);
router.get('/ready', getReadiness);

export default router;
