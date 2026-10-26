# Mineforge — import et lancement

Le code source fourni a été extrait de l'archive dans le dossier `claude/`.

## Démarrer en local

```bash
cd claude
npm ci
npm run dev
```

## Publication web

Le workflow GitHub Actions `.github/workflows/import-and-deploy.yml` tente de compiler le projet avec Vite puis de publier `claude/dist` sur GitHub Pages. Consultez l'onglet **Actions** pour le résultat de la compilation.

Dans **Settings → Pages**, la source doit être **GitHub Actions**.
