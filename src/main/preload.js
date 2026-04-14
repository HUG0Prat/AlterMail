const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('am', {
  // Window
  minimize: () => ipcRenderer.send('win-min'),
  maximize: () => ipcRenderer.send('win-max'),
  close:    () => ipcRenderer.send('win-close'),

  // Shell
  openDataFolder: ()      => ipcRenderer.invoke('open-data-folder'),
  openUrl:        (url)   => ipcRenderer.invoke('open-url', url),

  // Profiles
  getProfiles:   ()           => ipcRenderer.invoke('get-profiles'),
  createProfile: (name)       => ipcRenderer.invoke('create-profile', name),
  deleteProfile: (id)         => ipcRenderer.invoke('delete-profile', id),
  renameProfile: (id, name)   => ipcRenderer.invoke('rename-profile', { id, name }),
  switchProfile: (id)         => ipcRenderer.invoke('switch-profile', id),

  // CV
  uploadCV:  () => ipcRenderer.invoke('upload-cv'),
  getCVInfo: () => ipcRenderer.invoke('get-cv-info'),
  removeCV:  () => ipcRenderer.invoke('remove-cv'),

  // Cover letter
  saveCoverLetter: (t) => ipcRenderer.invoke('save-cover-letter', t),
  getCoverLetter:  ()  => ipcRenderer.invoke('get-cover-letter'),

  // Templates (multi)
  getTemplates:  ()      => ipcRenderer.invoke('get-templates'),
  saveTemplates: (tpls)  => ipcRenderer.invoke('save-templates', tpls),

  // Mail config
  saveMailConfig: (c) => ipcRenderer.invoke('save-mail-config', c),
  getMailConfig:  ()  => ipcRenderer.invoke('get-mail-config'),
  testConnection: (c) => ipcRenderer.invoke('test-connection', c),

  // Send
  sendMail: (o) => ipcRenderer.invoke('send-mail', o),

  // Conversations
  getSentMails:   ()          => ipcRenderer.invoke('get-sent-mails'),
  deleteSentMail: (id)        => ipcRenderer.invoke('delete-sent-mail', id),
  fetchReplies:   ()          => ipcRenderer.invoke('fetch-replies'),
  markReplyRead:  (mId, rId)  => ipcRenderer.invoke('mark-reply-read', { mailId: mId, replyId: rId }),

  // Polling
  startReplyPolling: () => ipcRenderer.send('start-reply-polling'),
  stopReplyPolling:  () => ipcRenderer.send('stop-reply-polling'),

  // Tracker
  getTracker:            ()     => ipcRenderer.invoke('get-tracker'),
  saveTracker:           (rows) => ipcRenderer.invoke('save-tracker', rows),
  getTrackerSettings:    ()     => ipcRenderer.invoke('get-tracker-settings'),
  saveTrackerSettings:   (s)    => ipcRenderer.invoke('save-tracker-settings', s),
});
