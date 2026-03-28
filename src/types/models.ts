export interface Plugin {
  id: number;
  title: string;
  bannerImage: string;
  imageDesc: string;
  size: string;
  linkDownload: string;
  type: string;
  version?: string;
}

export interface Pack {
  id: number;
  title: string;
  bannerImage: string;
  imageDesc: string;
  size: string;
  version: string;
  linkDownload: string;
  type: string;
}

export interface TokenPayload {
  accessToken: string;
  refreshToken: string;
  name: string;
  email: string;
  id: string;
  isInhouseEditor: boolean;
  timestamp: string;
}
