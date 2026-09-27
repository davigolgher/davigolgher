# App Store assets

## Screenshots — `screenshots/iphone-6.9/`

Six images at **1320 × 2868** (the 6.9" iPhone size App Store Connect requires;
it scales them down for smaller iPhones), PNG without transparency. Upload them
in this order:

1. `01-home.png` — Know what's left to spend
2. `02-add.png` — Log it in seconds
3. `03-subscriptions.png` — Never miss a renewal
4. `04-reports.png` — See where it all goes
5. `05-streak.png` — Build the habit
6. `06-review.png` — A one-minute daily review

They are the app's real screens (this version of the code), filled with
**fictitious data** and generic names — no real brands, since a third-party
name in a screenshot can be read as an endorsement. Around them: an iPhone 16
Pro outline with the Dynamic Island, the iOS status bar (9:41, signal, Wi-Fi,
full battery), and the three screens that open over the app — Add expense, Your
streak, Review my day — shown as iOS presents them, as a sheet with the screen
behind peeking at the top. The captions are in English, the listing's primary
language.

The screens were rendered from the app's web build with the Inter font, the
closest open font to iOS's own. If you'd rather have pixel-for-pixel iPhone
captures, take them in the iOS Simulator (iPhone 16 Pro Max) and swap them in —
same size, same order.

When the app's screens change, the screenshots have to change with them:
App Review checks that they show the app as it is.

## Subscription review screenshot — `iap-review/paywall.png`

App Store Connect asks for a screenshot of the purchase screen on each
subscription (the product → Review Information → Screenshot). It's seen only by
App Review, never on the store. This one is the paywall as a release build
shows it, with the planned prices — US$ 8.99 a month, US$ 59.99 a year, 14 days
free — at 1320 × 2868. Use the same image for both subscriptions. If the prices
change, it should be taken again so it matches what the reviewer will see.
