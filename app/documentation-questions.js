// The long documentation: the eleven sections a client writes about their company, and the questions in each.
// This list is the only place the question set lives. The server stores whatever it is sent under
// these ids and only checks the size, so a question can be reworded, added or retired here without a
// migration — an id that disappears simply stops being shown, and what was written under it is kept.
//
// `lines` sizes the box to the answer that is wanted: 1 for a sentence, 5 for a passage.
// `hint` is the example or the nudge, shown under the question rather than inside the box, so it is
// still readable once someone has started typing.
export const SECTIONS = [
  {
    id: 'positioning',
    title: 'Company positioning',
    note: 'Where the company stands, said broadly enough to still be true a year from now.',
    questions: [
      { id: 'what_you_do', lines: 2, q: 'In one sentence, what does your company do?',
        hint: 'Broad enough that it still holds as you grow into new products or services.' },
      { id: 'philosophy', lines: 3, q: 'What is the underlying philosophy or belief behind everything you make?' },
      { id: 'known_for', lines: 3, q: 'Is the company known for one product, audience or problem today?',
        hint: 'And should the site position you more broadly than that?' }
    ]
  },
  {
    id: 'product',
    title: 'Primary product or service',
    note: 'The one thing this site has to communicate right now.',
    questions: [
      { id: 'main_offer', lines: 3, q: 'What is the main product or service this website should communicate?',
        hint: 'One or two sentences, as you would say it to someone hearing about it for the first time.' },
      { id: 'taglines', lines: 3, q: 'Do you have a functional tagline and an emotional tagline?',
        hint: 'Functional is what it does; emotional is how it feels. If you have neither, what words come to mind for each?' },
      { id: 'keep_phrases', lines: 2, q: 'Are there any existing taglines or phrases you want kept?' }
    ]
  },
  {
    id: 'problem',
    title: 'The problem',
    note: 'What is wrong in the world without you.',
    questions: [
      { id: 'problem', lines: 3, q: 'What problem does your product or service address?' },
      { id: 'who_when', lines: 3, q: 'Who has this problem, and in what situations?' },
      { id: 'alternatives', lines: 3, q: 'What do people use to solve it now, and where does that fall short?' },
      { id: 'first_question', lines: 3, q: 'What question or idea first led you to your approach?' }
    ]
  },
  {
    id: 'how',
    title: 'How it works',
    note: 'The mechanism, plainly.',
    questions: [
      { id: 'steps', lines: 5, q: 'Can you explain how it works in three to five simple steps?',
        hint: 'One step per line is fine.' },
      { id: 'components', lines: 4, q: 'What are the key components or features that make up the whole system?' },
      { id: 'stage', lines: 2, q: 'What stage of development or availability is it in right now?' }
    ]
  },
  {
    id: 'principles',
    title: 'Principles and difference',
    note: 'Why you, rather than the alternative.',
    questions: [
      { id: 'different', lines: 3, q: 'What makes your approach different from the alternatives?' },
      { id: 'principles', lines: 5, q: 'Three to five guiding principles, each with a sentence or two.',
        hint: 'Single words or short phrases, then what each one means in practice.' }
    ]
  },
  {
    id: 'story',
    title: 'Story',
    note: 'Why the company exists at all.',
    questions: [
      { id: 'why_exist', lines: 4, q: 'Why does the company exist? What moment or experience started it?' },
      { id: 'evolution', lines: 4, q: 'How did it get from that first idea to where it is today?' },
      { id: 'mission', lines: 3, q: 'What is your mission?', hint: 'A draft is fine. We will work on the wording.' },
      { id: 'vision', lines: 3, q: 'What is the long-term vision?',
        hint: 'Where could the company go beyond its current product?' }
    ]
  },
  {
    id: 'team',
    title: 'Team',
    note: 'Who is behind it.',
    questions: [
      { id: 'people', lines: 6, q: 'Who are the founders and key team members?',
        hint: 'Name, title, and a sentence or two each. One person per line.' }
    ]
  },
  {
    id: 'credibility',
    title: 'Credibility',
    note: 'What can be shown, and what you are allowed to show.',
    questions: [
      { id: 'proof', lines: 4, q: 'What awards, partners, institutions, incubators or press can go on the site?' },
      { id: 'relationships', lines: 4, q: 'For each, what is the accurate relationship, and do you have permission to use the name or logo?',
        hint: 'For example: Recognized by, Supported by, Partnered with. Getting this wrong is a legal problem, so exact wording matters.' }
    ]
  },
  {
    id: 'updates',
    title: 'Updates and newsletter',
    note: 'What keeps arriving after launch.',
    questions: [
      { id: 'ongoing', lines: 3, q: 'What ongoing content do you expect to share?',
        hint: 'Milestones, research, events, press, behind-the-scenes, video.' },
      { id: 'newsletter', lines: 2, q: 'Do you have or plan a newsletter? How often, and covering what?' },
      { id: 'social', lines: 2, q: 'Which social channels should the site connect to?',
        hint: 'Paste the links.' }
    ]
  },
  {
    id: 'contact',
    title: 'Contact and structure',
    note: 'How people reach you, and what the site is made of.',
    questions: [
      { id: 'contact_method', lines: 2, q: 'What is the primary contact method, and what should the main call to action say?' },
      { id: 'pages', lines: 4, q: 'Which pages do you imagine the site needing?' },
      { id: 'remove', lines: 3, q: 'Is there anything on your current site that should be removed or reworked?' }
    ]
  },
  {
    id: 'design',
    title: 'Design direction',
    note: 'What is fixed, and what we are free to explore.',
    questions: [
      { id: 'fixed', lines: 3, q: 'What is fixed — logo, colours, fonts — and what is open for us to explore?' },
      { id: 'assets', lines: 4, q: 'What visual assets do you have?',
        hint: 'Product photography, renders, video, sketches, prototypes, archival images. Rough is fine; we need to know what exists.' }
    ]
  }
];

export const ALL_QUESTIONS = SECTIONS.flatMap((s) => s.questions.map((q) => q.id));
export const MAX_ANSWER = 4000;
