import { toast } from '../state';

/** Native share sheet on phones, clipboard elsewhere. */
export async function share(url: string, title: string) {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ url, title });
      return;
    } catch {
      /* cancelled or unsupported: fall back to copying */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch {
    toast(url, 6000); // no clipboard access: show it so it can be copied by hand
  }
}
