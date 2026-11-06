export interface User {
  id: string;
  name: string;
  handle: string; // e.g. "@lucas" or "lucas"
  password?: string;
  email?: string;
  avatar: string;
  bio?: string;
  online?: boolean;
  createdAt: string;
}

export type MessageType = 'text' | 'image' | 'audio';
export type MessageStatus = 'sending' | 'delivered' | 'read';

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderHandle: string;
  recipientId?: string;
  text?: string;
  type: MessageType;
  mediaUrl?: string; // photo base64/link or audio base64/link
  photosAttached?: string; // comma separated photo urls as requested
  audioDuration?: number; // duration in seconds
  timestamp: string;
  status: MessageStatus;
}

export interface Chat {
  id: string;
  participants: string[]; // user IDs
  contact: User;
  isSaved?: boolean;
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: string;
  isTyping?: boolean;
  isRecordingAudio?: boolean;
}
