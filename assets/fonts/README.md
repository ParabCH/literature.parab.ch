# Schriften für die erzeugten Beitragsbilder

Diese Dateien braucht `layouts/partials/post-og-image.html`. Hugo zeichnet damit
den Titel auf die Kachel (`images.Text` liest nur TTF/OTF, kein woff2).

| Datei | Verwendung auf der Kachel |
|---|---|
| `PlusJakartaSans-Bold.ttf` | Titel |
| `Inter-SemiBold.ttf` | Kategorie-Zeile oben |
| `Inter-Medium.ttf` | Urheber |
| `Inter-Regular.ttf` | Publikation |

Herkunft: Google Fonts ([Inter](https://fonts.google.com/specimen/Inter),
[Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)), beide
unter der SIL Open Font License 1.1.

Die Dateien sind verkleinert – sie enthalten Latein, Latein erweitert, Griechisch,
Interpunktion und einige Währungs- und Rechenzeichen. Andere Zeichen (Kyrillisch,
CJK) fehlen und erscheinen als leeres Rechteck. So neu erzeugen:

    pyftsubset Inter-Regular.ttf --output-file=Inter-Regular.ttf \
      --unicodes=U+0020-00FF,U+0100-017F,U+0180-024F,U+0370-03FF,U+2000-206F,U+20A0-20BF,U+2122,U+2190-2193,U+2212,U+2213,U+2264,U+2265,U+2248,U+00D7 \
      --layout-features=kern,liga,calt,ccmp,locl --no-hinting --desubroutinize
