# Emission Factors — Methodology & Sources

> EcoTrace Carbon Footprint Awareness Program

All emission factors are in **kg CO₂e per unit** unless noted. CO₂e (carbon dioxide equivalent) includes CO₂, CH₄, and N₂O weighted by Global Warming Potential (GWP100).

---

## Transport

### Car Travel (kg CO₂e per km)

| Vehicle type | Factor | Source |
|---|---|---|
| Petrol / Gasoline | 0.21 | DEFRA 2023 — average UK petrol car |
| Diesel | 0.25 | DEFRA 2023 — average UK diesel car |
| Hybrid | 0.10 | DEFRA 2023 — average hybrid |
| Electric | 0.05 | DEFRA 2023 — UK average grid intensity |
| No car | 0.00 | — |

### Flights (kg CO₂e per return trip)

Includes radiative forcing multiplier (RF factor ×2.0 per IPCC AR5):

| Flight type | Factor | Basis |
|---|---|---|
| Short-haul (< 3 hrs) | 255 | ~1,000 km return, economy, RF included |
| Long-haul (> 6 hrs)  | 1,200 | ~10,000 km return, economy, RF included |

**Source:** ICAO Carbon Emissions Calculator methodology; Atmosfair factors.

### Public Transport (annual adjustment, kg CO₂e)

| Use frequency | Adjustment |
|---|---|
| Never | 0 |
| Occasionally | +300 (some car replacement) |
| Regular | −400 (replaces car trips) |
| Daily commute | −800 (significant car reduction) |

---

## Home Energy

### Electricity Grid Intensity (kg CO₂e per kWh)

| Grid type | Factor | Source |
|---|---|---|
| Coal / high-carbon | 0.82 | IEA 2023 — India coal-heavy grid approx. |
| Mixed / average | 0.49 | IEA 2023 — global average grid |
| Natural gas | 0.35 | DEFRA 2023 |
| Renewable | 0.04 | IPCC AR6 — lifecycle solar/wind |

### Space Heating (kg CO₂e per household per year)

| Heating type | Factor | Source |
|---|---|---|
| Gas boiler | 2,500 | DEFRA 2023 — average gas consumption |
| Oil heating | 3,200 | DEFRA 2023 |
| Electric | 1,800 | Based on average kWh × grid factor |
| Heat pump | 600 | DEFRA 2023 — COP 3.0 assumed |
| District heating | 900 | EU average district heating intensity |

### Solar Panels (annual adjustment, kg CO₂e)

| Coverage | Adjustment |
|---|---|
| None | 0 |
| Partial | −300 |
| Full | −700 |

---

## Food & Diet

### Diet Type (tonnes CO₂e per person per year)

| Diet | Factor (t) | Source |
|---|---|---|
| Heavy meat | 3.3 | Poore & Nemecek (2018); Oxford study |
| Average meat | 2.5 | Poore & Nemecek (2018) |
| Low meat | 1.9 | Poore & Nemecek (2018) |
| Pescatarian | 1.4 | Poore & Nemecek (2018) |
| Vegetarian | 1.1 | Poore & Nemecek (2018) |
| Vegan | 0.9 | Poore & Nemecek (2018) |

**Key source:** Poore, J. & Nemecek, T. (2018). "Reducing food's environmental impacts through producers and consumers." *Science*, 360(6392), 987–992.

### Food Waste (tonnes CO₂e per person per year)

| Level | Factor (t) |
|---|---|
| High | +0.70 |
| Medium | +0.30 |
| Low | +0.10 |
| None | 0 |

**Source:** FAO (2013). "Food Wastage Footprint: Impacts on Natural Resources."

### Local / Seasonal Food (annual adjustment, t CO₂e)

| Frequency | Adjustment (t) |
|---|---|
| Rarely | +0.30 (more food miles) |
| Sometimes | +0.10 |
| Often | −0.10 |
| Always | −0.20 |

### Dairy Consumption (tonnes CO₂e per person per year)

| Level | Factor (t) |
|---|---|
| High | +0.80 |
| Medium | +0.45 |
| Low | +0.15 |
| None / plant-based | 0 |

---

## Shopping & Lifestyle

### Clothing (kg CO₂e per new item)

| Factor | Value | Source |
|---|---|---|
| Per new garment | 6 kg | WRAP 2017 — average clothing lifecycle |

### Electronics (kg CO₂e per new device)

| Factor | Value | Source |
|---|---|---|
| Per new device | 300 kg | Greenpeace / iFixit lifecycle assessments (average smartphone/laptop blend) |

### Recycling (annual adjustment, kg CO₂e)

| Habit | Adjustment |
|---|---|
| Never | +500 |
| Sometimes | +200 |
| Often | −100 |
| Always + composting | −400 |

### Second-hand Shopping (annual adjustment, kg CO₂e)

| Frequency | Adjustment |
|---|---|
| Never | 0 |
| Sometimes | −200 |
| Often | −500 |
| Mostly second-hand | −800 |

---

## Limitations & Assumptions

1. All factors are approximations. Exact values vary by region, individual behaviour, and year.
2. Car factors use UK fleet averages as a proxy for global average vehicles.
3. Flight factors use economy class with radiative forcing. Business/first class roughly doubles the footprint.
4. Energy is divided equally among household members; actual distribution may vary.
5. Food factors represent average Western consumption patterns; Indian dietary patterns typically produce lower emissions.
6. This model does not account for embodied carbon in housing construction or government/public services emissions (Scope 3).

---

## References

1. IPCC (2022). *AR6 Synthesis Report: Climate Change 2022.*
2. DEFRA (2023). *Greenhouse Gas Reporting: Conversion Factors 2023.* UK Government.
3. IEA (2023). *CO₂ Emissions from Fuel Combustion.*
4. Poore, J. & Nemecek, T. (2018). Science, 360(6392).
5. FAO (2013). *Food Wastage Footprint: Impacts on Natural Resources.*
6. WRAP (2017). *Valuing Our Clothes: the cost of UK fashion.*
7. Our World in Data (2023). *CO₂ and Greenhouse Gas Emissions.*
