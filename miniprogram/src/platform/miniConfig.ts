declare const BELLFIVE_MINI_AUTH_URL: string;
declare const BELLFIVE_MINI_WS_URL: string;

export const miniAuthUrl = typeof BELLFIVE_MINI_AUTH_URL === 'string' ? BELLFIVE_MINI_AUTH_URL : '';
export const miniWebSocketUrl = typeof BELLFIVE_MINI_WS_URL === 'string' ? BELLFIVE_MINI_WS_URL : '';
