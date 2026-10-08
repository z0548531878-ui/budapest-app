# הפעלת התראות (פעם אחת)

1. Firebase Console -> הפרויקט budapest-983e4 -> Upgrade -> תוכנית Blaze (עם תקרת תקציב נמוכה, למשל 5$).
2. Project settings -> Cloud Messaging -> Web Push certificates -> Generate key pair. מעתיקים את ה"Key pair" ושולחים ל-Claude.
3. פתיחת Cloud Shell (האייקון >_ למעלה בקונסולת Google Cloud) והרצה:

    git clone https://github.com/z0548531878-ui/budapest-app
    cd budapest-app/functions && npm install && cd ..
    firebase deploy --only functions --project budapest-983e4

(אם מבקש התחברות: `firebase login --no-localhost`.)
