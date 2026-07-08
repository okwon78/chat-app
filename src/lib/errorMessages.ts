// REST/WS 에러 code → 한글 안내 (근거: ../chat-server/docs/ERRORS.md).
// 분기는 code로만 한다 — 서버 message는 참고용으로 덧붙일 수 있으나 변할 수 있다.

import { ApiError } from '../types/models'

const MESSAGES: Record<string, string> = {
  // REST (ERRORS.md §2)
  invalid_json: '요청 본문이 유효한 JSON이 아닙니다.',
  invalid_request: '필수 입력값이 누락되었습니다.',
  user_not_found: '존재하지 않는 유저입니다. 먼저 유저를 생성하세요.',
  not_found: '방을 찾을 수 없습니다. (삭제되었거나 잘못된 ID)',
  forbidden: '방 소유자(owner)만 할 수 있는 작업입니다.',
  already_member: '이미 이 방의 멤버입니다.',
  internal: '서버 내부 오류가 발생했습니다.',

  // WS error 프레임 (ERRORS.md §1) — W2+에서 사용
  anonymous_forbidden: '익명 연결은 읽기 전용입니다. userId를 지정해 다시 연결하세요.',
  bad_envelope: '프레임이 유효한 Envelope 형식이 아닙니다.',
  bad_payload: '프레임 data가 해당 타입의 스키마에 맞지 않습니다.',
  unknown_type: '알 수 없는 프레임 타입입니다.',
  rate_limited: '메시지 전송 속도 제한을 초과했습니다. 잠시 후 다시 시도하세요.',
  room_not_found: '존재하지 않는(또는 삭제된) 방입니다.',
  not_joined: '먼저 방에 join한 뒤에 보낼 수 있습니다.',
  message_too_large: '메시지가 최대 크기(4096바이트)를 초과했습니다.',
}

// 매핑에 없는 code(예: http_404)는 code 자체를 노출해 디버깅 가능하게 한다.
export function errorMessage(code: string, serverMessage?: string): string {
  const known = MESSAGES[code]
  if (known) return known
  return serverMessage ? `[${code}] ${serverMessage}` : `알 수 없는 오류 (${code})`
}

// catch한 unknown 예외 → 사용자 안내 문구. fetch 자체 실패(TypeError)는
// 프록시 뒤 서버 미기동이 가장 흔한 원인이라 별도 안내한다.
export function describeError(e: unknown): string {
  if (e instanceof ApiError) return errorMessage(e.code, e.message)
  if (e instanceof TypeError) return '서버에 연결할 수 없습니다. (chat-server 기동/프록시 확인)'
  return e instanceof Error ? e.message : String(e)
}
