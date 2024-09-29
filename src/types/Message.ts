export interface Message {
  isBaileys: boolean;
  isOwner: boolean;
  body: string;
  text: string;
  reply: (response: string) => void;
}