// 글자 비교용 정규화: NFC, 소문자, 공백 전부 제거, 문장부호 제거(문자·숫자·₩ $ € % 만 남김)
export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}₩$€%]/gu, '');
}
