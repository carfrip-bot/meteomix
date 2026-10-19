# MeteoMix

Dashboard meteo responsive in italiano: ricerca di località, condizioni attuali, andamento orario, previsione settimanale e confronto tra modelli meteorologici.

## Avvio

Apri `index.html` in un browser oppure servi questa cartella con un server statico. Per esempio, da questa cartella:

```powershell
python -m http.server 8000
```

Poi visita `http://localhost:8000`.

Non servono account o chiavi API. Le richieste usano le API pubbliche di Open-Meteo. La disponibilità e la copertura dipendono dalla località e dal modello.

## Modalità Mix

Mix usa i modelli deterministici ECMWF IFS, DWD ICON, Météo-France e ItaliaMeteo/ARPAE selezionati dall'utente per le prime 72 ore. Aggrega i valori con la mediana per ridurre il peso di un singolo modello fuori scala. Dal quarto al settimo giorno combina gli ensemble ECMWF IFS nativo europeo, DWD ICON EPS e NOAA GEFS. La probabilità di pioggia è derivata dalla quota di membri che prevedono precipitazioni; la fascia 10°–90° dei valori di temperatura mostra la dispersione degli scenari.

Best Match resta disponibile come modalità singola e non entra nel Mix: è già una selezione/aggregazione automatica di modelli e aggiungerlo ai singoli modelli rischia di duplicare fonti. Le fonti non disponibili vengono escluse e segnalate. Le medie e le fasce di dispersione non sono previsioni ufficiali e non garantiscono accuratezza superiore; non sono ancora calibrate con uno storico di osservazioni locali.

## Fonti

- Open-Meteo Forecast API: https://open-meteo.com/en/docs
- Open-Meteo Ensemble API: https://open-meteo.com/en/docs/ensemble-api
- Modello Météo-France: https://open-meteo.com/en/docs/meteofrance-api
- Modelli e aggiornamenti: https://open-meteo.com/en/docs/model-updates
- ARPAE ICON-2I: https://www.arpae.it/it/temi-ambientali/meteo/previsioni-meteo/previsioni-meteo-modellistiche

L'uso senza chiave si riferisce alle richieste standard dell'API; restano validi i limiti e i termini del servizio Open-Meteo.

