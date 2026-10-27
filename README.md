# Cart Crash

Gioco per browser (in inglese, tradotto in 6 lingue) pensato per CrazyGames.
Guidi un carrello della spesa giù per un borgo italiano in discesa, in 3D,
visto da dietro. La discesa è infinita e generata a caso. Il giocatore sterza
solo a sinistra e a destra; tutto quello che raccoglie si impila davvero nel
carrello e cambia la guida.

## Come si gioca

- **Comandi:** frecce ← → oppure A / D; su telefono si tiene premuto il lato
  sinistro o destro dello schermo. Esc o P mette in pausa.
- **Punteggio:** ogni metro vale `1 + valore del carico ÷ 100` punti. Con il
  carrello vuoto fai 1 punto al metro, con 100 di spesa 2 punti al metro, e così via.
- **Fine partita:** al terzo schianto (cassonetti, casse, coni, motorini,
  dissuasori, passanti). Dopo uno schianto hai 1,6 s di tregua. Buche, cordoli
  e scale non costano vite, ma scuotono la pila.
- **La velocità** cresce con la distanza; anche gli ostacoli e i passanti
  aumentano.

| Oggetto | Valore | Effetto |
|---|---|---|
| Anguria | 25 | pesa: il carrello sterza più lento e scende più veloce |
| Palloncini | 15 | alleggeriscono: piccoli salti periodici che scavalcano buche e pozzanghere (più palloncini, salti più alti) |
| Olio d'oliva | 20 | scivoli per circa 3 s; anche le pozzanghere d'olio fanno scivolare |
| Spesa varia (cereali, carta igienica, pomodori, pane, formaggio, bibita, ananas, detersivo) | 10 | la pila cresce, ondeggia quando sterzi e, se pende troppo, l'oggetto in cima cade |
| Uova | 40 | valgono tanto ma si rompono sui colpi forti (buche, atterraggi, schianti) |

Il cesto tiene al sicuro quello che sta sotto il bordo; ciò che sporge cade se
la pila pende troppo, con una buca o in uno schianto. Oltre i 9 m di altezza
l'oggetto in cima scivola via da solo ("No room!").

Lungo la strada ci sono anche passanti che attraversano (se li urti è uno
schianto: volano via in modo buffo, nessuno si fa male), piccioni che si alzano
in volo quando passi, un cane che ti insegue per qualche secondo abbaiando,
rampe, buche e pozzanghere d'olio. Le sezioni sono quattro: strada,
marciapiede alberato, scalinata (ogni gradino è un piccolo colpo) e mercato
con le tende a righe.

Record (punteggio e distanza) salvati solo in locale.

## Tecnica

- HTML5 + JavaScript (moduli ES), **Three.js r170** in `vendor/three/` (MIT),
  nessuna libreria di fisica: la pila è una molla simulata a mano in
  `src/game.js`.
- Tutti i modelli sono low-poly costruiti nel codice (`src/models.js`,
  `src/town.js`): non ci sono file di modelli né texture. Font Lilita One e
  Nunito (OFL) in `vendor/fonts/`.
- Il borgo si genera a sezioni da un seme (`src/world.js`); ciò che resta
  indietro viene scartato, così la memoria non cresce durante la discesa.
- La simulazione (`src/game.js`) è deterministica e separata dal disegno
  (`src/render3d.js`): i test guidano intere discese senza browser.
- Lingue: en, it, fr, es, de, pt (`src/locales/`). La lingua viene da
  CrazyGames (`user.systemInfo.locale`) o dal browser, e si cambia nelle
  impostazioni.
- Il gioco sta tutto nel riquadro, senza barre di scorrimento, su computer e
  telefono (verticale e orizzontale). I pulsanti sono di almeno 44 px.

## Comandi npm

```
npm install
npm run dev               # build web in dist/ e server su http://127.0.0.1:8080
npm test                  # test unitari (mondo, guida, pila, vite, passanti, cane, traduzioni)
npm run test:e2e          # Playwright: telefono, telefono orizzontale, desktop, build CrazyGames con SDK finto
npm run build:crazygames  # dist-crazygames/ e crazygames/cart-crash-crazygames.zip
npm run media             # copertine, icone e video di anteprima ricavati dal gioco
npm run shots             # screenshot rapidi per controllare la grafica
```

## CrazyGames

`npm run build:crazygames` produce la cartella `dist-crazygames/` e lo zip
`crazygames/cart-crash-crazygames.zip`. **Lo zip non va caricato così com'è:**
va estratto, e i file vanno trascinati nel portale (oppure si trascina il
contenuto di `dist-crazygames/`).

La build per CrazyGames (`src/portal.js`, SDK v3 caricato solo lì):

- `init` all'avvio, `loadingStart` / `loadingStop` intorno al caricamento;
- `gameplayStart` quando parte o riprende la discesa, `gameplayStop` in pausa,
  nel menu e a fine partita;
- `happytime` quando batti il record;
- rispetta `settings.muteAudio` e `addSettingsChangeListener`;
- lingua da `user.systemInfo.locale`.

Niente login, niente pubblicità esterne, niente link verso altri siti. La
pagina `privacy.html` è dentro lo zip ed è linkata dal menu e dalle
impostazioni (anche su telefono). Contatto: info@eyeball.cloud.

Materiali in `crazygames/`, tutti generati dal gioco con `npm run media`:

- copertine `cover-1920x1080.png`, `cover-800x1200.png` (2:3), `cover-800x800.png`;
- video `preview-1920x1080.mp4` e `preview-1080x1620.mp4` (2:3), 30 s ciascuno.

## Struttura

```
index.html, styles.css, privacy.html
src/main.js        schermate, input, ciclo di gioco, record, hook per i test
src/game.js        simulazione: carrello, carico, pila, vite, punteggio
src/world.js       generazione infinita del percorso e di ciò che c'è sopra
src/bot.js         pilota automatico (sfondo del menu, test, video)
src/render3d.js    scena Three.js, telecamera, oggetti in movimento, effetti
src/town.js        geometria del borgo per ogni sezione
src/models.js      modelli low-poly (oggetti, carrello, ostacoli, passanti, piccioni, cane)
src/audio.js       effetti e musica sintetizzati con Web Audio
src/portal.js      wrapper dell'SDK CrazyGames v3
src/i18n.js, src/strings.js, src/locales/   traduzioni
scripts/           build, server, media, screenshot, chiavi di traduzione
tests/, e2e/       test unitari e end-to-end
```
