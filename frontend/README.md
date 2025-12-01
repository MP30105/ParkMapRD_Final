# Parking Frontend

Steps to create and run the frontend:

PowerShell
```
cd frontend
npx create-react-app .
npm install @react-google-maps/api
npm start
```

After running `npx create-react-app .`, replace the files in `src/` with the provided files in this workspace.

Using a Google Maps API key
---------------------------
This project reads the Google Maps JavaScript API key from an environment variable at build time. Create a file named `.env` in the `frontend/` folder (next to `package.json`) with the following content:

REACT_APP_GOOGLE_MAPS_API_KEY=YOUR_REAL_KEY_HERE

Then restart the dev server or rebuild the production bundle so the key is embedded into the app:

PowerShell
```
cd frontend
npm start    # for development
# or for production build
npm run build
```

If you don't provide a key, the map will show the "This page didn't load Google Maps correctly" error in the browser console.
