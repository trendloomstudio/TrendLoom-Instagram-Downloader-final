declare namespace Chrome {
  interface Runtime {
    id?: string;
    getManifest(): Manifest.Manifest;
    getURL(path: string): string;
    onMessage: Runtime.MessageEvent;
    sendMessage(message: any, callback?: (response: any) => void): void;
    sendMessage(message: any, options?: Runtime.SendMessageOptions): Promise<any>;
  }

  namespace Runtime {
    interface MessageEvent extends Event {
      addListener(
        callback: (message: any, sender: MessageSender, sendResponse: (response?: any) => void) => boolean | void
      ): void;
      removeListener(
        callback: (message: any, sender: MessageSender, sendResponse: (response?: any) => void) => void
      ): void;
    }

    interface MessageSender {
      id?: string;
      url?: string;
      tab?: Tab;
      frameId?: number;
    }

    interface SendMessageOptions {
      includeTlsChannelId?: boolean;
    }
  }

  interface Storage {
    local: Storage.LocalArea;
    sync: Storage.SyncArea;
  }

  namespace Storage {
    interface StorageArea {
      get(keys?: string | string[] | object | null): Promise<object>;
      get(
        keys: string | string[] | object | null,
        callback: (items: object) => void
      ): void;
      set(items: object): Promise<void>;
      set(items: object, callback?: () => void): void;
      remove(keys: string | string[]): Promise<void>;
      remove(keys: string | string[], callback?: () => void): void;
      clear(): Promise<void>;
      clear(callback?: () => void): void;
    }

    interface LocalArea extends StorageArea {}
    interface SyncArea extends StorageArea {}
  }

  interface Tab {
    id?: number;
    url?: string;
    title?: string;
    favIconUrl?: string;
  }

  namespace Manifest {
    interface Manifest {
      name: string;
      version: string;
      manifest_version: number;
      description?: string;
      permissions?: string[];
      host_permissions?: string[];
      background?: Background;
      content_scripts?: ContentScript[];
      options_page?: string;
      icons?: Icons;
      web_accessible_resources?: WebAccessibleResource[];
    }

    interface Background {
      service_worker: string;
    }

    interface ContentScript {
      matches: string[];
      js?: string[];
      css?: string[];
      run_at?: string;
      world?: string;
    }

    interface Icons {
      [size: string]: string;
    }

    interface WebAccessibleResource {
      matches: string[];
      resources: string[];
    }
  }
}

interface DownloadHistoryItem {
  id: string;
  label: string;
  url: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed';
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface InstagramPost {
  shortcode: string;
  mediaType: 'image' | 'video' | 'carousel';
  mediaUrls: string[];
  caption?: string;
  username: string;
}

interface DownloadOptions {
  quality?: 'high' | 'medium' | 'low';
  includeCaption?: boolean;
  filenamePattern?: string;
}

interface ExtensionSettings {
  downloadQuality: 'high' | 'medium' | 'low';
  includeCaption: boolean;
  filenamePattern: string;
  autoDownload: boolean;
  showNotifications: boolean;
  maxHistoryItems: number;
  enableRetry: boolean;
  maxRetries: number;
}
