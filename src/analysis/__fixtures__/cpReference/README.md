# Swami–Chandra reference pressure coefficients

`swamiChandraLowRise.json` holds hand-computed values of the Swami & Chandra
(1988) surface-average wind-pressure-coefficient correlation. It is committed
static data: nothing in the test suite recomputes it, and in particular it is
**not** produced by `src/analysis/cpCorrelation.js`, the module it is used to
check.

## Source and exact form

M. V. Swami and S. Chandra, _"Correlations for pressure distribution on
buildings and calculation of natural-ventilation airflow"_, ASHRAE Transactions
**94**(1), 1988. The low-rise expression used here is the normalised form
`Cp(a) / Cp(0)` with `Cp(0) = 0.6`, as reproduced in the EnergyPlus Engineering
Reference (_Wind Pressure Coefficients_, surface-average calculation):

```
Cp(a) = 0.6 * ln[ 1.248
                  - 0.703 sin(a/2)
                  - 1.175 sin^2(a)
                  + 0.131 sin^3(2 a G)
                  + 0.769 cos(a/2)
                  + 0.07 G^2 sin^2(a/2)
                  + 0.717 cos^2(a/2) ]
```

- `a` — angle of incidence between the wind and the **outward normal** of the
  wall, in `[0°, 180°]`. `a = 0` is a wall facing straight into the wind,
  `a = 180` a fully leeward wall.
- `G = ln(S)` — natural log of the **side ratio** `S`, the width of the wall
  under consideration divided by the width of the wall adjacent to it.
- The `2 a G` term is linear in `a`, so evaluating it in degrees or radians
  gives the same angle; everything else is scale-free in the same way.

The correlation covers windward, side and leeward walls in one expression —
there is no separate leeward constant. It is an empirical fit for **low-rise**
buildings (up to about three storeys) in open exposure.

## Block and side ratios

The reference block is a rectangular low-rise plan **12 m (north/south facades)
× 8 m (east/west facades)**, matching the block the LBM validation sweep runs.

| facade      | width | adjacent width | side ratio `S` | `G = ln(S)` |
| ----------- | ----- | -------------- | -------------- | ----------- |
| north/south | 12 m  | 8 m            | 1.5            | +0.405465   |
| east/west   | 8 m   | 12 m           | 0.666667       | −0.405465   |
| (square)    | —     | —              | 1.0            | 0           |

## What is in the file

- `incidenceSweep` — `Cp` at **8 incidence angles** (0°, 22.5°, 45°, 67.5°, 90°,
  112.5°, 135°, 180°) for all three side ratios above.
- `windAngles` — the same correlation evaluated per facade for the **8
  meteorological wind directions** 0°, 45°, …, 315° that the LBM sweep runs, with
  the incidence angle each facade sees. Model space has `+y` pointing south, so
  the north facade's outward normal is `(0, −1)`; a meteorological bearing names
  the direction the wind comes **from**, giving a "from" unit vector
  `(sin β, −cos β)` and an incidence `a = acos(n · from)`.

Numbers are rounded to 6 decimal places.

## How the numbers were produced

Evaluated offline with a throwaway script that types the published expression
out directly, then pasted in. Three values are easy to check by hand for the
square plan (`G = 0`, so the `sin^3(2aG)` and `0.07 G^2 …` terms vanish):

| `a`  | bracket                                                     | `ln`      | `Cp = 0.6 ln` |
| ---- | ----------------------------------------------------------- | --------- | ------------- |
| 0°   | `1.248 + 0.769 + 0.717` = 2.734000                          | 1.005772  | **+0.603459** |
| 90°  | `1.248 − 0.497096 − 1.175 + 0.543765 + 0.358500` = 0.478169 | −0.737792 | **−0.442675** |
| 180° | `1.248 − 0.703` = 0.545000                                  | −0.606969 | **−0.364182** |

`Cp(0°) = 0.6034`, not exactly 0.600: the bracket is a least-squares fit and is
2.734 rather than `e` at normal incidence. That 0.6 % is a property of the
published correlation, not a transcription error.

## Consumers

- `src/analysis/cpCorrelation.test.js` — checks the module reproduces these
  values.
- `src/analysis/facadeCpValidation.test.js` — compares the D2Q9 solver's facade
  means against `windAngles`. Read the header of that file first: a 2D
  pedestrian-height slice and a 3D low-rise correlation are not the same
  physical quantity, and the measured deviations are documented there.
