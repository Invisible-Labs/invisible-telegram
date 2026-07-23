import { Markup } from "telegraf";

export const CALLBACK = {
  CREATE_TRANSFER: "user:create-transfer",
  REFUND: "user:refund",
} as const;

export type UserAction = (typeof CALLBACK)[keyof typeof CALLBACK];

export const USER_ACTIONS = [
  {
    callbackData: CALLBACK.CREATE_TRANSFER,

    label: "🕶️ Create private transfer",
  },

  {
    callbackData: CALLBACK.REFUND,

    label: "↩️ Request refund",
  },
] as const;

export const START_VIEW_TEXT =
  "🕶️ Invisible SDK demo\n\nChoose a user action 👇";

export function startView() {
  return Markup.inlineKeyboard(
    USER_ACTIONS.map((action) => [
      Markup.button.callback(action.label, action.callbackData),
    ]),
  );
}
