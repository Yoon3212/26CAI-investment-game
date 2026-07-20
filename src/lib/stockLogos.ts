const LOGOS: Record<string, string> = {
  유현자동차: '/logos/유현자동차.jpg',
  승현엔터: '/logos/승현엔터.jpg',
  민준바이오: '/logos/민준바이오.jpg',
  이안화학: '/logos/이안화학.jpg',
  '정민IT': '/logos/정민IT.jpg',
  호현생명: '/logos/호현생명.jpg',
  서현뷰티: '/logos/서현뷰티.jpg',
}

export function logoForStock(name: string): string | undefined {
  return LOGOS[name]
}
