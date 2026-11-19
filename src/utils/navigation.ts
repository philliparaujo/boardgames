export const HOME_PATH = "/home";
export const LOBBY_PATH = "/lobby";
export const GAME_PATH_PATTERN = "/game/:gameId";
export const gamePath = (gameId: string) => `/game/${gameId}`;
