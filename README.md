# MeteoMix

Dashboard meteo responsive in italiano: ricerca di località, condizioni attuali, andamento orario, previsione settimanale e confronto tra modelli meteorologici.

## Avvio

Apri `index.html` in un browser oppure servi questa cartella con un server statico. Per esempio, da questa cartella:

```powershell
python -m http.server 8000
```

Poi visita `http://localhost:8000`.

Non servono account o chiavi API. Le richieste usano l'API pubblica di Open-Meteo e modelli previsionali di servizi meteorologici nazionali: Best Match, ECMWF IFS, DWD ICON, Météo-France e ItaliaMeteo/ARPAE ICON 2I. La disponibilità e la copertura dipendono dalla località e dal modello.

## Modalità Mix

Mix interroga in parallelo i modelli selezionati nelle impostazioni. Fa la media dei valori numerici per fasce di tre ore e usa la condizione meteo più frequente per descrivere il tempo. Un modello non disponibile viene escluso e segnalato nella pagina. Questa sintesi non è una previsione ufficiale né una garanzia di accuratezza superiore.

## Fonti

- Open-Meteo Forecast API: https://open-meteo.com/en/docs
- Modello Météo-France: https://open-meteo.com/en/docs/meteofrance-api
- Modelli e aggiornamenti: https://open-meteo.com/en/docs/model-updates

L'uso senza chiave si riferisce alle richieste standard dell'API; restano validi i limiti e i termini del servizio Open-Meteo.

