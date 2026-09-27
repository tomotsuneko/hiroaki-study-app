import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { setActiveModels, DEFAULT_MODELS } from '@/lib/model-manager';

export async function GET(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set.");
    }

    // 1. Fetch available models from Gemini API
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) {
      throw new Error("Failed to fetch models from Gemini API");
    }
    const data = await res.json();
    
    // 2. Parse models
    const allModels: string[] = data.models.map((m: any) => m.name.replace('models/', ''));
    
    // 3. Filter and sort Flash models
    const flashModels = allModels.filter(m => m.includes('flash') && m.startsWith('gemini-')).sort((a, b) => b.localeCompare(a));
    // Filter and sort Pro models
    const proModels = allModels.filter(m => m.includes('pro') && m.startsWith('gemini-') && !m.includes('vision')).sort((a, b) => b.localeCompare(a));

    // 4. Construct optimal fallback chains
    // Prioritize explicitly requested 3.8/3.7 if they exist in the API, otherwise fallback to highest available.
    // If the API doesn't return them yet (e.g. preview), we inject them at the top just in case they are accessible.
    
    const baseFlashChain = [...new Set([...DEFAULT_MODELS.chat, ...flashModels])];
    const baseProChain = [...new Set([...DEFAULT_MODELS.syllabus, ...proModels, ...flashModels])];

    await setActiveModels('chat', baseFlashChain);
    await setActiveModels('syllabus', baseProChain);

    return NextResponse.json({ 
      success: true, 
      message: "AI Models have been successfully synced and updated.",
      updatedChains: {
        chat: baseFlashChain,
        syllabus: baseProChain
      },
      availableApiModels: allModels
    });

  } catch (error: any) {
    console.error('Update Models Error:', error);
    return NextResponse.json({ error: 'Failed to update models: ' + error.message }, { status: 500 });
  }
}
