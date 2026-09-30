// Map registry — order matches the real game's Configure Map list (Random is handled by the menu).
// thumb: a 16:9 preview image written by `node tools/shot.mjs --thumbs` into assets/thumbs/<id>.jpg
export const MAPS = [
  { id: 'mansion', name: 'Hide-and-Seek Mansion', load: () => import('./mansion.js') },
  { id: 'sewer', name: 'Sewer', load: () => import('./sewer.js') },
  { id: 'backrooms', name: 'Backrooms', load: () => import('./backrooms.js') },
  { id: 'country', name: 'Indoor Country', load: () => import('./country.js') },
  { id: 'hotel', name: 'Penguin Hotel', load: () => import('./hotel.js') },
  { id: 'sugar', name: 'Sugar Land', load: () => import('./sugar.js') },
  { id: 'osaka', name: 'Osaka', load: () => import('./osaka.js') },
  // Not in the Configure Map list:
  { id: 'lobby', name: 'Lobby', hidden: true, load: () => import('./lobby.js') },
  { id: 'test', name: 'Test Room', hidden: true, load: () => import('./test.js') },
];

export const PLAYABLE = MAPS.filter((m) => !m.hidden);
export const thumb = (id) => `assets/thumbs/${id}.jpg`;
