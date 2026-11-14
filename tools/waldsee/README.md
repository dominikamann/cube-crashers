# Bad Waldsee: from the town to tiles

`town.py` turns an extract of OpenStreetMap into the tiles of the Bad Waldsee map: where one can walk (streets,
lanes, squares), the houses with a number each, the gardens and the lake.

The data is © OpenStreetMap contributors, licensed under the ODbL. The extract itself is not in this repository;
fetch it with:

```sh
curl -H "User-Agent: cube-crashers (hello@amannlabs.eu)" --data-urlencode \
  'data=[out:json][timeout:90];(way(47.9180,9.7505,47.9235,9.7585);node(47.9180,9.7505,47.9235,9.7585)[~"^(amenity|historic|natural|tourism|leisure)$"~"."];);out body;>;out skel qt;' \
  https://overpass-api.de/api/interpreter -o osm2.json
python3 town.py   # writes grid2.json and prints the plan
```

## The real walls

`solids.gen.ts` gives the sim the outlines of the real buildings (`src/sim/config/waldsee-solids.ts`), so that one
stops at a slanted front where it really is, and makes the wall tiles a front covers only in part floor again. It
needs the render code's `shown()`, so it runs under vitest; afterwards the board fences are worked out again:

```sh
npx vitest run --config tools/waldsee/vitest.config.ts                    # prints what it would do
WALDSEE_WRITE=1 npx vitest run --config tools/waldsee/vitest.config.ts    # writes the solids and the plan
python3 -I fences.py ../.. --write                                        # the fences for the new plan
```
