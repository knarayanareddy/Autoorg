TypeScript

import { z } from 'zod';

export const JudgeCalibrationSchema = z.object({
  agreement_score: z.number().min(0).max(1),
  mean_variance: z.number().min(0),
  unstable_cases: z.array(z.string()).max(20),
  notes: z.array(z.string()).max(10),
});

export const JUDGE_CALIBRATOR_SYSTEM_PROMPT = `
You assess consistency of benchmark judgments.

Inputs:
- multiple judge outputs for the same attempts
- score components and justifications
- variance summary

Your job:
1. estimate agreement from 0 to 1,
2. estimate mean variance,
3. identify unstable cases,
4. note likely causes of instability.

Hard rules:
- Large swings in groundedness or policy compliance matter more than small novelty swings.
- If justifications contradict the numeric scores, note that.
`.trim();
15. Judge calibration harness