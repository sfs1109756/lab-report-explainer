import app from './app.js';

const port = Number(process.env.PORT ?? 3004);
app.listen(port, () => console.log(`Lab Report Explainer API on http://localhost:${port}`));
