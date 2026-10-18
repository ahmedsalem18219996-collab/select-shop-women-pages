// Public configuration only. The publishable key is designed to be public (Supabase "sb_publishable_…");
// it grants nothing by itself: every Admin action is authorized by the database for the signed-in user.
export const CONFIG = Object.freeze({
  supabaseUrl: 'https://byluoipdunralsurwebt.supabase.co',
  publishableKey: 'sb_publishable_p6RdEwK1ffVY6ul7SOn00g_NwGozy42',
  api: 'https://byluoipdunralsurwebt.supabase.co/functions/v1/women-admin',
  storagePublic: 'https://byluoipdunralsurwebt.supabase.co/storage/v1/object/public/',
  // Where invitation and password-reset e-mails send people back to.
  appUrl: 'https://selectshopeg.com/admin/',
  currency: 'EGP'
});
