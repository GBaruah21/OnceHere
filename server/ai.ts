import { GoogleGenAI, Type } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

export interface ImageAnalysisResult {
  caption: string;
  detectedMood: string;
  memoryNote: string;
  suggestedNotes: Array<{ authorName: string; text: string }>;
  quote: string;
  suggestedMilestoneTitle: string;
  suggestedRole: string;
  tags: string[];
  altText: string;
}

/**
 * Robust fallback generator if Gemini API key is unavailable, remote image fetch fails, or model is under temporary high demand
 */
function getSmartFallbackAnalysis(promptHint?: string, archiveType?: string): ImageAnalysisResult {
  const hints = `${promptHint || ''} ${archiveType || ''}`.toLowerCase();

  if (hints.includes('teacher') || hints.includes('teachers day') || hints.includes("teacher's day")) {
    return {
      caption: 'A Teachers’ Day celebration filled with handmade notes, grateful smiles, and the people who made every lesson matter.',
      detectedMood: 'Gratitude & Celebration',
      memoryNote: 'The timetable paused for a while, and the classroom became a small celebration of every teacher who guided us. The photographs kept the decorations, laughter, and thank-you messages together in one place.',
      suggestedNotes: [
        { authorName: 'Class Representative', text: 'Thank you for believing in us, even on the days we forgot the homework.' },
        { authorName: 'Batchmate', text: 'The cards were handmade, the rehearsal was last-minute, and the smiles were completely real.' },
        { authorName: 'Class Scribe', text: 'One day dedicated to the teachers behind so many of our everyday memories.' }
      ],
      quote: '“Some of the lessons we remember most were never written on the board.”',
      suggestedMilestoneTitle: 'Teachers’ Day Together',
      suggestedRole: 'Class Representative',
      tags: ['Teachers Day', 'Classroom', 'Gratitude', 'Celebration'],
      altText: 'Students and teachers smiling together during a Teachers’ Day classroom celebration'
    };
  }
  
  if (hints.includes('canteen') || hints.includes('chai') || hints.includes('food') || hints.includes('samosa') || hints.includes('coffee') || hints.includes('tea') || hints.includes('cafe')) {
    return {
      caption: 'Unscheduled hours outside the canteen where 4-year plans were made over cutting chai.',
      detectedMood: 'Canteen Camaraderie & Warmth',
      memoryNote: 'We came for a quick 5-minute tea break and stayed for three hours. Some conversations made more sense than entire semesters of syllabus.',
      suggestedNotes: [
        { authorName: 'Alex M.', text: 'Remember when we skipped mechanics just to get fresh batch samosas?' },
        { authorName: 'Rohan K.', text: 'Best cutting chai on campus, undisputed.' },
        { authorName: 'Class Scribe', text: 'Where all major life decisions and semester panic were shared.' }
      ],
      quote: '“Every major life problem was solved over one hot cup of adrak chai.”',
      suggestedMilestoneTitle: 'The Daily Canteen Tapri Debates',
      suggestedRole: 'Tapri In-Charge & Chief Chai Scribe',
      tags: ['Canteen Chronicles', 'Cutting Chai', 'Hostel Life', 'Everyday Memories'],
      altText: 'Batchmates gathered around the college canteen sharing laughs and snacks'
    };
  }

  if (hints.includes('lab') || hints.includes('code') || hints.includes('hackathon') || hints.includes('project') || hints.includes('tech') || hints.includes('debug')) {
    return {
      caption: 'Late-night debugging, glowing monitor screens, and pizza boxes stacked by the keyboard.',
      detectedMood: 'Focused Hustle & Breakthrough Joy',
      memoryNote: 'The code finally compiled at 3:45 AM. We didn’t know whether to celebrate or sleep, so we did an impromptu victory lap through the silent hallway.',
      suggestedNotes: [
        { authorName: 'Sam T.', text: 'It worked on the demo slide. Nobody knows how, but it worked!' },
        { authorName: 'Priya D.', text: '36 hours awake on energy drinks and pure adrenaline.' },
        { authorName: 'Code Lead', text: 'Best team breakthrough of our entire final year.' }
      ],
      quote: '“It worked on the demo slide. Nobody knows how, but it worked.”',
      suggestedMilestoneTitle: 'The 36-Hour Hackathon Breakthrough',
      suggestedRole: 'Tech Lead & Emergency Debugger',
      tags: ['Lab Nights', 'Hackathon', 'Breakthroughs', 'All-Nighters'],
      altText: 'Students collaborating over laptops and code in the laboratory late at night'
    };
  }

  if (hints.includes('farewell') || hints.includes('convocation') || hints.includes('grad') || hints.includes('degree') || hints.includes('robe') || hints.includes('cap')) {
    return {
      caption: 'Black robes, tossed mortarboards, and the sweet ache of stepping into the next chapter.',
      detectedMood: 'Triumphant Milestone & Bittersweet Nostalgia',
      memoryNote: 'We threw our caps into the sky and watched four years float between us and the future. We walked in as strangers and left with a shared history.',
      suggestedNotes: [
        { authorName: 'Ananya S.', text: 'Can’t believe our college chapter has officially concluded.' },
        { authorName: 'Dev R.', text: 'From nervous freshmen in orientation to graduates together.' },
        { authorName: 'Classmate', text: 'This isn’t goodbye, just see you at the first reunion.' }
      ],
      quote: '“The archive ends here. The story does not.”',
      suggestedMilestoneTitle: 'Convocation & Farewell Toss',
      suggestedRole: 'Class Valedictorian & Dreamer',
      tags: ['Convocation', 'Farewell 2026', 'Milestones', 'Graduation Toss'],
      altText: 'Graduating students celebrating with graduation caps tossed in the air'
    };
  }

  if (hints.includes('sport') || hints.includes('basketball') || hints.includes('cricket') || hints.includes('football') || hints.includes('tournament') || hints.includes('match') || hints.includes('trophy')) {
    return {
      caption: 'Final whistle euphoria, dirt on the jerseys, and holding up the championship cup.',
      detectedMood: 'Electric Adrenaline & Team Pride',
      memoryNote: 'Down by two points with 10 seconds on the clock, we pulled off the impossible comeback. The crowd stormed the court before the buzzer even finished sounding.',
      suggestedNotes: [
        { authorName: 'Coach Dave', text: 'That fourth-quarter defense was the best teamwork I’ve witnessed in 10 years.' },
        { authorName: 'Jersey #7', text: 'Still have the bruised knees and championship rings to prove it!' },
        { authorName: 'Cheer Crew', text: 'Our voices were completely gone by the time the trophy was lifted.' }
      ],
      quote: '“Champions do not show up for the glory; they show up for each other.”',
      suggestedMilestoneTitle: 'Inter-College Championship Victory',
      suggestedRole: 'Clutch Captain & Spirit Leader',
      tags: ['Championship', 'Game Day', 'Sports Triumph', 'Team Spirit'],
      altText: 'Athletes celebrating with trophies and team jerseys after a major win'
    };
  }

  if (hints.includes('trip') || hints.includes('trek') || hints.includes('beach') || hints.includes('travel') || hints.includes('mountain') || hints.includes('bus') || hints.includes('road')) {
    return {
      caption: 'Singing off-key on the bus back seat, watching sunrise over mountain passes.',
      detectedMood: 'Wanderlust & Unbounded Freedom',
      memoryNote: 'Three flat tires, zero cellphone reception, and the absolute best weekend of our entire university years. No itinerary could have planned memories this authentic.',
      suggestedNotes: [
        { authorName: 'Navigator', text: 'Taking the wrong turn led to the best hidden waterfall on the entire coast.' },
        { authorName: 'Camp DJ', text: 'Our acoustic playlist on loop under the open galaxy.' },
        { authorName: 'Trip Leader', text: 'Can we please run this trip back every single year?' }
      ],
      quote: '“The best journeys are not defined by destinations, but by the companions beside you.”',
      suggestedMilestoneTitle: 'The Unplanned Annual Class Road Trip',
      suggestedRole: 'Designated Navigator & Campfire DJ',
      tags: ['Class Trip', 'Road Trip', 'Unscripted Moments', 'Golden Hour'],
      altText: 'Friends smiling on a road trip with scenic outdoor background'
    };
  }

  if (hints.includes('fest') || hints.includes('cultural') || hints.includes('concert') || hints.includes('stage') || hints.includes('dance') || hints.includes('music')) {
    return {
      caption: 'Strobe lights flashing, amphitheater bass booming, and thousands singing in unison.',
      detectedMood: 'Euphoric Celebration & Collective Rhythm',
      memoryNote: 'After three months of relentless rehearsals and backstage chaos, the spotlight hit and the crowd went wild. That three-minute performance felt like eternity.',
      suggestedNotes: [
        { authorName: 'Stage Lead', text: 'We pulled off that lighting transition with 2 seconds to spare!' },
        { authorName: 'Audience Row 1', text: 'The energy in the quad was absolutely unforgettable.' },
        { authorName: 'Backstage Crew', text: 'Exhausted, covered in confetti, and immensely proud.' }
      ],
      quote: '“Turn the music louder; tonight is ours.”',
      suggestedMilestoneTitle: 'Annual Cultural Fest Grand Finale',
      suggestedRole: 'Fest Head & Stage Performer',
      tags: ['Cultural Fest', 'Concert Night', 'Amphitheater', 'Spotlight'],
      altText: 'Stage performance with vibrant lights and cheering crowd'
    };
  }

  return {
    caption: 'A candid snapshot of laughter and unscripted connection frozen in golden light.',
    detectedMood: 'Golden Nostalgia & Unfiltered Joy',
    memoryNote: 'Years from now, this photograph will remind us of the exact feeling of this afternoon—loud laughter, familiar voices, and having nowhere else we needed to be.',
    suggestedNotes: [
      { authorName: 'Classmate', text: 'One of my favorite memories from this entire year!' },
      { authorName: 'Memory Keeper', text: 'Unfiltered, candid joy—pure gold.' },
      { authorName: 'Batchmate', text: 'Still laughing thinking about what happened right before this shot.' }
    ],
    quote: '“We didn’t realize we were making memories; we just knew we were having fun.”',
    suggestedMilestoneTitle: 'Golden Afternoon on Campus',
    suggestedRole: 'Memory Keeper & Backbencher',
    tags: ['Candid Memories', 'Golden Hour', 'Batch Days', 'Unforgettable'],
    altText: 'Friends smiling and sharing a genuine candid memory together'
  };
}

/**
 * Helper to call Gemini model with fallback and retry on temporary 503 high demand spikes
 */
async function callGeminiWithResilience(
  ai: GoogleGenAI,
  systemPrompt: string,
  promptText: string,
  imagePart: { inlineData: { mimeType: string; data: string } } | null
) {
  const contents: any = imagePart
    ? { parts: [imagePart, { text: promptText }] }
    : promptText;

  const config = {
    systemInstruction: systemPrompt,
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        caption: { type: Type.STRING },
        detectedMood: { type: Type.STRING },
        memoryNote: { type: Type.STRING },
        suggestedNotes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              authorName: { type: Type.STRING },
              text: { type: Type.STRING }
            },
            required: ['authorName', 'text']
          }
        },
        quote: { type: Type.STRING },
        suggestedMilestoneTitle: { type: Type.STRING },
        suggestedRole: { type: Type.STRING },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        altText: { type: Type.STRING }
      },
      required: ['caption', 'detectedMood', 'memoryNote', 'suggestedNotes', 'quote', 'suggestedMilestoneTitle', 'tags', 'altText']
    }
  };

  // Primary model: gemini-3.7-flash, with fallback to gemini-flash-latest if temporarily unavailable
  const modelsToTry = ['gemini-3.7-flash', 'gemini-flash-latest'];

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });

      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      const isTemporaryDemand = err?.status === 503 || err?.message?.includes('503') || err?.message?.includes('high demand') || err?.message?.includes('UNAVAILABLE') || err?.status === 429;
      if (isTemporaryDemand) {
        console.warn(`[Gemini AI] Model ${model} is experiencing temporary high demand (503/429), attempting graceful alternative.`);
        // Brief jitter pause before trying next candidate
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      throw err;
    }
  }

  throw new Error('All model attempts temporarily busy.');
}

/**
 * Analyzes an image with Gemini 3.7 Flash multimodal intelligence
 */
export async function analyzeMemoryImage(
  imageDataOrUrl: string,
  contextHint?: string,
  archiveType?: string
): Promise<ImageAnalysisResult> {
  const ai = getGenAI();

  if (!ai) {
    return getSmartFallbackAnalysis(contextHint, archiveType);
  }

  try {
    let imagePart: { inlineData: { mimeType: string; data: string } } | null = null;

    if (imageDataOrUrl.startsWith('data:')) {
      const match = imageDataOrUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        imagePart = {
          inlineData: {
            mimeType: match[1],
            data: match[2]
          }
        };
      }
    } else if (imageDataOrUrl.startsWith('http://') || imageDataOrUrl.startsWith('https://')) {
      try {
        const fetchRes = await fetch(imageDataOrUrl, { signal: AbortSignal.timeout(5000) });
        if (fetchRes.ok) {
          const contentType = fetchRes.headers.get('content-type') || 'image/jpeg';
          const buffer = await fetchRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          imagePart = {
            inlineData: {
              mimeType: contentType.split(';')[0],
              data: base64
            }
          };
        }
      } catch (err) {
        console.warn('Could not fetch remote image for Gemini, falling back to contextual analysis:', err);
      }
    }

    const systemPrompt = `You are the lead memory curator, archivist, and yearbook editor for OnceHere—a premium digital memory archive platform for school batches, college classes, teams, and reunions.
Analyze the provided photograph or video highlight with deep emotional resonance, nostalgic warmth, authenticity, and observant detail.
Generate engaging memory artifacts suitable for media vaults, captions, suggested classmate notes, and timeline milestones.
Treat the creator's contextual clue, draft caption, and requested changes as authoritative. Use visual analysis to enrich those details, not contradict them. If a previous suggestion and a change request are supplied, produce a genuinely different revision that follows the requested tone, length, and event.
Never invent a different occasion when the creator identifies one. Keep captions natural, specific, and suitable for a student memory archive.
${contextHint ? `Creator context and instructions: ${contextHint}` : ''}
${archiveType ? `Archive category: ${archiveType}` : ''}`;

    const promptText = `Please analyze this memory photo/video and output a structured JSON analysis containing:
1. "caption": A concise, evocative caption (1-2 sentences) capturing the specific scene, emotion, or candid interaction.
2. "detectedMood": A brief 2-4 word description of the emotional atmosphere (e.g. "Festive Energy & Golden Hour", "Quiet Camaraderie & Focus").
3. "memoryNote": A heartfelt, vivid 2-3 sentence personal memory or story entry.
4. "suggestedNotes": An array of 2 to 3 short, realistic, warm or humorous classmate notes / inside jokes that could be attached to this photo (each with "authorName" like "Alex M." or "Batchmate" and "text").
5. "quote": A witty, memorable, or reflective 1-line quote or yearbook motto suitable for a member card.
6. "suggestedMilestoneTitle": A punchy 3-6 word title if this moment were added to an archive timeline (e.g., "The Midnight Project Rush", "Annual Sports Day Relay").
7. "suggestedRole": A fun or fitting yearbook role/tag (e.g., "Backbench Legend", "Chief Organizer", "Tapri Scribe").
8. "tags": An array of 3-5 relevant short hashtag topics.
9. "altText": A clean, descriptive accessibility alt text describing visual elements.`;

    const text = await callGeminiWithResilience(ai, systemPrompt, promptText, imagePart);
    if (!text) throw new Error('Empty response from Gemini');
    
    const parsed = JSON.parse(text);
    return {
      caption: parsed.caption || 'A memorable moment frozen in time.',
      detectedMood: parsed.detectedMood || 'Warm Nostalgia',
      memoryNote: parsed.memoryNote || 'A day that felt ordinary then, but irreplaceable now.',
      suggestedNotes: Array.isArray(parsed.suggestedNotes) && parsed.suggestedNotes.length > 0
        ? parsed.suggestedNotes
        : [
            { authorName: 'Classmate', text: 'One of the best days of that semester!' },
            { authorName: 'Batchmate', text: 'Still remember laughing so hard our stomachs hurt.' }
          ],
      quote: parsed.quote || '“Some moments never fade.”',
      suggestedMilestoneTitle: parsed.suggestedMilestoneTitle || 'Unforgettable Memories',
      suggestedRole: parsed.suggestedRole || 'Memory Contributor',
      tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : ['Memories', 'Batchmates'],
      altText: parsed.altText || 'Memory archive photograph'
    };
  } catch (error: any) {
    console.warn('[Gemini AI] Using smart contextual memory fallback analysis due to upstream spike:', error?.message || error);
    return getSmartFallbackAnalysis(contextHint, archiveType);
  }
}
