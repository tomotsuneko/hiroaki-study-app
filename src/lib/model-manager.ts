import { dbAdmin } from './firebase-admin';

export type ProcessType = 'syllabus' | 'chat';

export const DEFAULT_MODELS = {
  syllabus: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  chat: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-1.5-flash"]
};

export async function getActiveModelsConfig(): Promise<{syllabus: string[], chat: string[], updatedAt: string | null}> {
  if (!dbAdmin) return { ...DEFAULT_MODELS, updatedAt: null };
  try {
    const doc = await dbAdmin.collection('config').doc('ai_models').get();
    if (doc.exists) {
      const data = doc.data();
      return {
        syllabus: data?.syllabus || DEFAULT_MODELS.syllabus,
        chat: data?.chat || DEFAULT_MODELS.chat,
        updatedAt: data?.updatedAt || null
      };
    }
  } catch (e) {
    console.error("Failed to fetch models", e);
  }
  return { ...DEFAULT_MODELS, updatedAt: null };
}

export async function getActiveModels(processName: ProcessType): Promise<string[]> {
  const config = await getActiveModelsConfig();
  return config[processName];
}

export async function setActiveModels(processName: ProcessType, models: string[]) {
  if (!dbAdmin) return;
  await dbAdmin.collection('config').doc('ai_models').set({
    [processName]: models,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}
