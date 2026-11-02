# What engine sounds players love, and how the store is priced

RevLine is a voice game: players rev with their own voice and buy cars for how they
**sound**. Store prices therefore follow how much people love a sound, not lap times.
Performance stays nearly equal (a turbo adds +12% acceleration). A map's recommended
car class matters more than price: any car can enter any round, but an unsuited class
faces rivals 6% faster.

## What the research shows

Recent "best sounding car" lists, enthusiast articles and meme culture repeat the same
groups:

1. **High-revving V10 / V12 and race rotaries.** The Lexus LFA's V10, the four-rotor
   Mazda 787B, Lamborghini V10s and old F1 V10s top almost every list. Jalopnik ran a
   three-hour LFA sound video, and the 787B is called the best-sounding race car ever.
   → tier **Legend sound**, the most expensive.
2. **Turbo icons: straight-six howl, turbo whistle and blow-off flutter.** The Supra MK4
   2JZ and Skyline RB26 are tuner legends, and "Is that a Supra?" is a long-running
   meme about the 2JZ sound. Whistle and *stu-tu-tu* flutter are the most-shared tuner
   sound clips. → tier **Turbo icon**.
3. **Rotary brap.** The RX-7's 13B idle "brap" and pops are instantly recognisable.
   → tier **Rotary**.
4. **V8 burble and crackle.** Mustang, Challenger, Camaro and Corvette V8s are the
   mass-appeal favourites: deep, loud and crackly. → tier **V8 / big engine**.
5. **High-revving fours (VTEC).** The S2000, Civic Type R and AE86 4A-GE are loved for
   the scream at the top, but they're cheaper and more common. → tier **High-rev four**.
6. **Street turbo fours and small engines** (Satria, Wira) → tier **Street**.
7. **Diesel and work trucks** (Hilux) → tier **Utility**, the cheapest.

**Parts follow the same rule.** Straight pipes, titanium cans (pops and flames), big
single turbos (siren whistle) and flutter blow-off valves are the most-wanted sounds,
so they cost the most. Stock parts are free.

**Monster trucks** run supercharged, methanol-burning big-block V8s around 540 cubic
inches. They're extremely loud, with heavy low-end rumble. The Monster Arena region
needs dedicated truck recordings before it ships, because the current engine library
has none.

## Prices in the game (`frontend/shared/economy.js`)

| Tier | Price range (coins) | Examples |
|---|---|---|
| Legend sound | 34,000–75,000 | 787B 75k, APX F1 70k, LFA 60k, Huracán 55k |
| Turbo icon | 14,000–40,000 | Supra MK4 40k, R34 38k, R35 34k |
| Rotary | 30,000–50,000 | RX-7 FD 32k, Veilside 34k |
| V8 / big engine | 18,000–30,000 | Corvette C8 30k, Challenger 24k, Mustang 20k |
| High-rev four | 12,000–16,000 | S2000 16k, Civic Type R 14k, AE86 12k |
| Street | 7,000–8,000 | Satria 8k, Wira 7k |
| Utility | 6,000 | Hilux 6k |

- The Carrera GT starter is free, and new players get 2,000 starter coins.
- An engine swap costs 40% of the car whose sound it is. Engines from your own cars are free.
- Parts: exhaust 1,500–9,000, turbo 4,000–12,000, blow-off 1,000–5,000, intake 2,000–5,000.
- Meter skins: 5,000–8,000 coins, or Gold for 25 gems.

## Earning

- Race coins: 1st 400, 2nd 200, 3rd 100, 4th 40, multiplied by difficulty (Easy ×1,
  Normal ×1.5, Hard ×2.2) and by +5% for each later round. Quick races pay half. Crashing
  out or blowing the engine pays nothing.
- Stars: Hard 1st = 3★, Normal 1st = 2★, Easy 1st = 1★, and 2nd place gets one star less.
  On drift rounds, each multiple of the drift target earns a star, capped by difficulty.
- Gems: +3 for the first 3★ on a round and +20 for finishing a region. The gem store is
  shown but marked "coming soon". This build has no payments.
- Points: the score, plus 100 per star, 150 for a clean race (no bumps) and drift points.

## Sources

- Carwow, best-sounding cars: https://carwow.co.uk/blog/best-sounding-cars
- Fast Car, best-sounding cars of all time: https://www.fastcar.co.uk/tuning-tech-guides/best-sounding-cars-of-all-time/
- Driven (NZ), the best-sounding car of all time: https://www.drivencarguide.co.nz/news/whats-the-best-sounding-car-of-all-time/
- Jalopnik, three hours of the LFA's V10: https://jalopnik.com/spend-3-hours-listening-to-the-lexus-lfa-s-v10-roar-1851735909/
- Gear Patrol: https://www.gearpatrol.com/?p=161619
- WhichCar: https://www.whichcar.com.au/?p=528727
- The Leader, best-sounding cars in the world: https://www.theleader.com.au/story/9121644/revealed-the-best-sounding-cars-in-the-world/
- Automotive Addicts, top 10 best-sounding cars: https://www.automotiveaddicts.com/92840/automotive-addicts-top-10-best-sounding-cars
- WapCar, cars that sound better than modern F1 cars: https://www.wapcar.my/news/here-are-5-cars-that-sound-better-than-modern-f1-cars-2616
- Benzin, best exhaust sounds: https://benzin.fr/en/articles/show/bruit0sonorite0son0echappement0voiture0best0sound0cars0exhaust-5d41a3a1316ad
- The Drive, best-sounding Porsches: https://www.thedrive.com/porsche/7674/the-top-five-best-sounding-porsche-countdown.md
- "Is that a Supra?" meme: https://meme.com/memes/is-that-a-supra/md
- SlashGear, monster truck engines: https://www.slashgear.com/1768941/monster-truck-engine-what-types-use-explained
- EngineerFix, why monster trucks are so loud: https://engineerfix.com/why-are-monster-trucks-so-loud/

The tiers are a judgement drawn from these lists, not a measured ranking. Prices live
in one table, so they're easy to rebalance after play-testing.
