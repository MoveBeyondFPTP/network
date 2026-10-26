# Network — your personal CRM

A contacts app for your phone and laptop. Scan business cards, tag people by which of your portfolios they're a good fit for, and keep notes. Everything saves automatically to your own account, so it syncs between devices and survives logging out or reinstalling.

**What you'll set up (about 20 minutes, all free, no credit card):**
1. **Firebase** (by Google) stores your data and handles sign-in. Free projects don't pause when you're away.
2. **GitHub Pages** hosts the app and gives you a web link.
3. **Your iPhone** gets the app on its Home Screen.

---

## 1. Set up your database (Firebase)

**Create the project**
1. Go to **console.firebase.google.com** and sign in with a Google account.
2. Click **Create a project** (or *Add project*). Name it (e.g. "network"). You can turn off Google Analytics; it isn't needed. Click through to finish.

**Turn on email sign-in**
3. In the left menu, open **Build → Authentication** → **Get started**.
4. Under *Sign-in method*, click **Email/Password**, switch on the first toggle (*Email/Password*), and **Save**.

**Create the database**
5. Open **Build → Firestore Database** → **Create database**.
   - If asked for an edition, choose **Standard**.
   - Pick a location near you (e.g. *us-central*). This can't be changed later.
   - Choose **Start in production mode**, then **Create**.
6. Open the **Rules** tab. Delete what's there, then paste in everything from the file `firestore.rules` in this folder.
7. In what you pasted, replace `YOUR_EMAIL_HERE` with the email you'll use to sign in to the app (keep the quote marks). Click **Publish**.

> This rule means only you, signed in with that email, can read or write anything. Even if someone found your app link and made an account, they'd be locked out.

**Get your settings**
8. Click the **gear icon** (top left) → **Project settings**. Scroll to *Your apps* and click the **web icon `</>`**.
9. Give it a nickname (e.g. "web"). Leave *Firebase Hosting* unticked. Click **Register app**.
10. You'll see a block of code containing `const firebaseConfig = { ... }`. Open `config.js` from this folder in any text editor (on a Mac, TextEdit → Format → Make Plain Text) and copy each value across: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`. Save the file.

> These values are designed to be public. Your contacts are protected by the rule you published in step 7.

## 2. Put the app online (GitHub Pages)

1. Go to **github.com** and sign up or sign in.
2. Click **+** (top right) → **New repository**. Name it (e.g. `network`), choose **Public**, and click **Create repository**.
3. On the new repository page, click **uploading an existing file**. Drag in **everything inside this folder**, including the `icons` folder and the `.nojekyll` file. (To see hidden files on a Mac, press Cmd + Shift + . in Finder.) Click **Commit changes**.
4. Go to the repository's **Settings → Pages**. Under *Build and deployment*, set **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)**, and click **Save**.
5. After a minute, refresh that page. Your link appears at the top, like `https://yourname.github.io/network/`.

> A Public repository is needed for free GitHub Pages. That only makes the app's code visible, never your contacts.

## 3. Connect the two

1. Back in Firebase: **Build → Authentication → Settings → Authorized domains → Add domain**. Enter `yourname.github.io` (your GitHub username, no `https://` and no `/network`). Click **Add**.
2. Open your app link, tap **Create an account**, and sign up with **the same email you put in the rules**.

## 4. Add it to your iPhone

1. Open your link in **Safari** (it must be Safari).
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Open it from the Home Screen icon and sign in. It runs full-screen like a regular app.

On your laptop, just bookmark the link. In Chrome or Edge you can also click the install icon in the address bar.

---

## Using it

- **Scan a card:** tap the dark button in the middle of the bottom bar, then *Take a photo*. The card is read on your phone, the fields fill in, and you check them before tapping **Save**. The first scan downloads the reader (about 10 MB), so it's slower once; after that it's quick.
- **Portfolios:** tap the tag icon to create portfolios (e.g. "Real estate", "Consulting") and pick colors. On any contact, tap the portfolios they're a good connection for, as many or as few as you like. Filter by portfolio using the chips at the top.
- **Notes:** each contact has a dated notes log. Search looks through notes too.
- **Auto-save:** edits save as you type. The dot next to "Synced" shows the status. With no signal, changes are kept on the device and sync automatically when you're back online.
- **Backups:** tap your initials → **Export CSV** any time for a spreadsheet of everything.
- **Save to phone contacts:** on any contact, tap *Save to phone contacts* to add them to your iPhone's Contacts app.

## Good to know

- **Your data lives in your Firebase account, not on your phone.** Deleting the app, signing out or switching phones doesn't lose anything. Just sign in again.
- **No pausing.** Free Firebase projects stay on even if you don't use the app for months. There's nothing to reactivate.
- **Free limits are far above what a personal CRM uses:** 1 GB of storage and tens of thousands of reads and writes per day. With no card on file you can never be charged; if a daily limit were ever hit, it would simply reset the next day.
- **Card photos** are compressed and stored with the contact (Firebase's separate file storage now needs a billing account, so this avoids it).
- **Forgot your password?** Use "Forgot password?" on the sign-in screen. Firebase emails you a link to set a new one, then you sign in as normal.
- **Signing out while offline:** the app warns you if there are changes that haven't reached your account yet, so you can wait until you're back online.
- **Updating the app:** upload the changed files to your GitHub repository the same way (Add file → Upload files). The app picks up the new version next time it opens online.

## Files

| File | What it is |
|---|---|
| `index.html` | The page that loads the app |
| `app.js` | The app itself |
| `parser.js` | Turns business card text into fields |
| `styles.css` | The look |
| `config.js` | **Your Firebase settings — edit this** |
| `firestore.rules` | Security rule to paste into Firebase (add your email) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Let it install on your Home Screen and open offline |
