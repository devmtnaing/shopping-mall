// Strings for the rental form and unit plans. They ship with the form (a chunk that loads when it
// opens), not in the first download like en.ts, so they carry their own Burmese too.
export const rentEn = {
  'rent.title': 'Rent this unit',
  'rent.intro':
    'This unit is free. Tell the mall’s host about your shop and they’ll get back to you by email.',
  'rent.name': 'Your name',
  'rent.email': 'Email',
  'rent.emailHint':
    'Use an email you really check. If you’re approved, the link to set up your shop’s admin is sent there, and it’s the email you’ll sign in with.',
  'rent.phone': 'Phone (optional)',
  'rent.business': 'Shop name',
  'rent.kind': 'Type of shop',
  'rent.plan': 'How your unit would look, from above (the door is at the bottom)',
  'rent.about': 'What will you sell?',
  'rent.privacy': 'Only the mall’s host sees these details.',
  'rent.send': 'Send application',
  'rent.sending': 'Sending…',
  'rent.sent':
    'Thanks, your application for this unit is in. If the host approves it, you’ll get an email with a link to set up your shop.',
  'rent.taken': 'Sorry, this unit has just been taken.',
  'rent.requested':
    'Someone has already applied for this unit, and the host is looking at it. If they turn it down, the unit opens again. Other vacant units are free to apply for.',
  'rent.tooMany': 'You’ve sent a few applications already. Please try again later.',
  'rent.invalid': 'Please check the details and try again.',
  'rent.error': 'Couldn’t send your application. Please try again.',
  'rent.offline': 'Applications open when the mall is online. Please try again later.',
  'kind.cafe': 'Café, food & drink',
  'kind.books': 'Books & stationery',
  'kind.fashion': 'Fashion & accessories',
  'kind.home': 'Home, plants & decor',
  'kind.games': 'Games & toys',
  'kind.store': 'Something else',
  'plan.cafe': 'Tables and chairs down both sides, and a coffee bar at the back.',
  'plan.books': 'Bookcases along both walls and the back, and a till.',
  'plan.fashion': 'Shoe walls down both sides, bag shelves and a till.',
  'plan.home': 'Plant stands down both sides, plants, a sofa and a till.',
  'plan.games': 'A row of arcade machines down each wall, a sofa and a till.',
  'plan.store': 'Shelves down both sides, a trolley by the door and a till.',
} as const;
export type RentKey = keyof typeof rentEn;

// Drafted without a native speaker: please review and improve (see CONTRIBUTING.md).
export const rentMy: Record<RentKey, string> = {
  'rent.title': 'ဒီဆိုင်ခန်း ငှားရန်',
  'rent.intro': 'ဒီဆိုင်ခန်း လွတ်နေပါတယ်။ သင့်ဆိုင်အကြောင်း မောလ် တာဝန်ခံကို ပြောပြပါ၊ အီးမေးလ်ဖြင့် ပြန်ဆက်သွယ်ပါမယ်။',
  'rent.name': 'သင့်အမည်',
  'rent.email': 'အီးမေးလ်',
  'rent.emailHint': 'အမှန်တကယ် စစ်ဖြစ်တဲ့ အီးမေးလ်ကို ထည့်ပါ။ လက်ခံရင် ဆိုင်ကို စီမံဖို့ လင့်ခ်ကို ဒီအီးမေးလ်သို့ ပို့ပါမယ်၊ ဒီအီးမေးလ်နဲ့ ဝင်ရပါမယ်။',
  'rent.phone': 'ဖုန်းနံပါတ် (မထည့်လည်း ရပါတယ်)',
  'rent.business': 'ဆိုင်အမည်',
  'rent.kind': 'ဆိုင် အမျိုးအစား',
  'rent.plan': 'အပေါ်စီးမှ ကြည့်လျှင် သင့်ဆိုင်ခန်း ပုံစံ (တံခါးက အောက်ခြေမှာ)',
  'rent.about': 'ဘာတွေ ရောင်းမလဲ?',
  'rent.privacy': 'ဒီအချက်အလက်တွေကို မောလ် တာဝန်ခံသာ မြင်ရပါမယ်။',
  'rent.send': 'လျှောက်လွှာ ပို့မယ်',
  'rent.sending': 'ပို့နေပါတယ်…',
  'rent.sent': 'ကျေးဇူးပါ၊ ဒီဆိုင်ခန်းအတွက် သင့်လျှောက်လွှာ ရောက်ပါပြီ။ တာဝန်ခံက လက်ခံရင် ဆိုင်ကို စီမံဖို့ လင့်ခ်ပါတဲ့ အီးမေးလ် ရပါမယ်။',
  'rent.taken': 'စိတ်မကောင်းပါဘူး၊ ဒီဆိုင်ခန်းကို ငှားပြီးသွားပါပြီ။',
  'rent.requested':
    'ဒီဆိုင်ခန်းအတွက် တခြားသူ လျှောက်ထားပြီးပါပြီ၊ တာဝန်ခံက စစ်ဆေးနေပါတယ်။ ငြင်းပယ်ရင် ပြန်လျှောက်လို့ ရပါမယ်။ တခြား လွတ်နေတဲ့ ဆိုင်ခန်းတွေကို လျှောက်နိုင်ပါတယ်။',
  'rent.tooMany': 'လျှောက်လွှာ အများအပြား ပို့ပြီးပါပြီ။ နောက်မှ ထပ်ကြိုးစားပါ။',
  'rent.invalid': 'အချက်အလက်တွေကို ပြန်စစ်ပြီး ထပ်ကြိုးစားပါ။',
  'rent.error': 'လျှောက်လွှာ ပို့လို့ မရပါ။ ထပ်ကြိုးစားပါ။',
  'rent.offline': 'မောလ် အွန်လိုင်း ဖြစ်မှ လျှောက်လို့ ရပါမယ်။ နောက်မှ ထပ်ကြိုးစားပါ။',
  'kind.cafe': 'ကော်ဖီဆိုင်၊ အစားအသောက်',
  'kind.books': 'စာအုပ်နှင့် စာရေးကိရိယာ',
  'kind.fashion': 'ဖက်ရှင်နှင့် အဆင်တန်ဆာ',
  'kind.home': 'အိမ်သုံး၊ အပင်နှင့် အလှဆင်ပစ္စည်း',
  'kind.games': 'ဂိမ်းနှင့် ကစားစရာ',
  'kind.store': 'အခြား',
  'plan.cafe': 'နှစ်ဘက်စလုံးတွင် စားပွဲနှင့် ကုလားထိုင်များ၊ နောက်ဘက်တွင် ကော်ဖီကောင်တာ။',
  'plan.books': 'နံရံနှစ်ဘက်နှင့် နောက်ဘက်တွင် စာအုပ်စင်များ၊ ငွေရှင်းကောင်တာ။',
  'plan.fashion': 'နှစ်ဘက်စလုံးတွင် ဖိနပ်စင်များ၊ အိတ်စင်များနှင့် ငွေရှင်းကောင်တာ။',
  'plan.home': 'နှစ်ဘက်စလုံးတွင် အပင်စင်များ၊ အပင်များ၊ ဆိုဖာနှင့် ငွေရှင်းကောင်တာ။',
  'plan.games': 'နံရံတစ်ဘက်စီတွင် ဂိမ်းစက်တန်း၊ ဆိုဖာနှင့် ငွေရှင်းကောင်တာ။',
  'plan.store': 'နှစ်ဘက်စလုံးတွင် ပစ္စည်းစင်များ၊ တံခါးနားတွင် တွန်းလှည်းနှင့် ငွေရှင်းကောင်တာ။',
};

/** The rental strings for each locale (English fills any gaps). */
export const RENT_TABLES: Record<string, Partial<Record<RentKey, string>> | undefined> = {
  en: rentEn,
  my: rentMy,
};
