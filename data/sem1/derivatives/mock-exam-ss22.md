# Derivatives · Mock Exam – Final Exam (eTest) SS 2022

### (Q1) Which of the following statements is most likely correct in the context of margin requirements?
- [ ] All answers are wrong
- [ ] Margins maximize the possibility of a loss through a default
- [ ] A margin is an illiquid asset deposited by an investor with his or her broker in a margin account
- [x] Margin accounts are adjusted at the end of each trading day to reflect the investors gain or loss (marking to market)
> Erklärung: Richtige Antwort laut Klausur: Marking to market – Margin-Konten werden täglich an Gewinn/Verlust angepasst. (Margin ist ein liquides Asset, und Margins reduzieren – nicht maximieren – das Ausfallrisiko.)

### (Q2) A CCP is calculating the initial margin for a DAX future. It assumes that the DAX follows a log-normal distribution with a yearly (stressed) volatility of 35% and an expected return of zero. Which of the following values is closest to the initial margin, if the CCP would like to make sure that 99.9% percent of the losses over a two-day period are covered? Hint: Assume 250 trading days per calendar year and round intermediate results to six decimal places.
- [ ] 6.6%
- [ ] 6.0%
- [ ] 12.8%
- [x] 9.2%
> Erklärung: Richtige Antwort laut Klausur: 9.2%. Ansatz: 2-Tages-Volatilität σ·√(2/250) mit dem 99.9%-Quantil (z ≈ 3.0902) der Normalverteilung skaliert.

### (Q3) What is most likely NOT CORRECT?
- [x] Basis is defined as future price minus spot price
- [ ] At maturity the basis is zero
- [ ] Basis is defined as spot price minus future price
- [ ] Basis risk occurs, if maturity of future > maturity of underlying
> Erklärung: Richtige Antwort laut Klausur (= die falsche Aussage): „Basis is defined as future price minus spot price". Die Basis ist definiert als Spot- minus Future-Preis.

### (Q4) An airline needs 13,000 bbl Kerosene by November, 15. For better calculating ticket prices, the company wants to rule out any price risk on June, 1. On that day, the longest available Kerosene Future on the CME with maturity on September, 15, is traded at F_0 = 70 USD/bbl. The spot price on the same day is S_0 = 60.5 USD/bbl. On September, 15, the airline closes out the Future contract and opens a new one, with maturity on December, 15. The price of the Future is F_t = 76.3 USD/bbl, and the spot price on that day is S_t = 78.9 USD/bbl. On November, 15, the price of the Future is F_t = 94.1 USD/bbl, and the spot price S_t = 100.5 USD/bbl. The contract size of both of the Future contracts is 1,000 bbl. Which of the following values is closest to the price (USD/bbl) the company effectively has fixed by June, 1?
- [x] 73.8
- [ ] 76.4
- [ ] 94.1
- [ ] 66.9
> Erklärung: Richtige Antwort laut Klausur: 73.8. Rolling-Hedge: effektiver Preis = finaler Spot minus kumulierter Future-Gewinn aus beiden Kontrakten.

### (Q5) Which of the following statements is most likely not correct in the context of Future and Forward contracts?
- [ ] Future contracts are settled daily and available for a range of delivery dates
- [ ] Future contracts are exchange traded contracts with virtually no credit risk
- [x] Forward contracts are standardized contracts between two parties
- [ ] In case of forward contracts, at maturity there is usually delivery or cash settlement
> Erklärung: Richtige Antwort laut Klausur (= die falsche Aussage): Forwards sind gerade NICHT standardisiert, sondern individuell (OTC) ausgehandelt.

### (Q6) Which of the following statements is most likely correct in the context of credit default swap indices?
- [x] Two main families of CDS Indices are CDX and iTraxx
- [ ] Credit default swap indices are completely customized and less liquid than CDS
- [ ] Credit default swap indices can generally be used to track the volatility smile
- [ ] A credit default swap index consists of few individual CDS and thus is not suitable to hedge a portfolio of credit risks
> Erklärung: Richtige Antwort laut Klausur: Die zwei Hauptfamilien der CDS-Indizes sind CDX und iTraxx.

### (Q7) A refining company wants to sell 47,000,000 gallons of jet fuel in three months from now, i.e. on October 20th, 2022. Assume that the company wants to use December heating oil future contracts to hedge its risk. Each contract is for the delivery of 75,000 gallons of heating oil. The parameters of the change in the spot and future prices are as follows: σ_S = 0.5721, σ_F = 0.6515, ρ = 0.95. Assume that the refining company wants to implement an optimal (i.e. variance minimizing) hedge. Which of the following results is closest to how many contracts of heating oil should be bought or sold? Please round the result to two decimal places.
- [x] 522.78
- [ ] 751.20
- [ ] 496.64
- [ ] 626.67
> Erklärung: Richtige Antwort laut Klausur: 522.78. Hedge-Ratio h* = ρ·σ_S/σ_F, Kontraktzahl = h*·(47,000,000 / 75,000).

### (Q8) There are four traded bonds. No market frictions. Principal of all bonds is 100, all values in Euro. Table (T = time of repayment, P = price at t=0, C = coupon at t=1/t=2/t=3):  Bond A: T=1, P=98, C1=4, C2=---, C3=---.  Bond B: T=3, P=93, C1=6, C2=6, C3=6.  Bond C: T=2, P=91, C1=5, C2=5, C3=---.  Bond D: T=3, P=?, C1=2.5, C2=3.8, C3=4.2.  Use continuous compounding, round percentage results to three decimal places. Which of the following values is closest to the continuously compounded (c.c.) zero rate with a maturity of 1 year?
- [ ] 6.1%
- [ ] 7.0%
- [x] 5.9%
- [ ] 5.4%
> Erklärung: Richtige Antwort laut Klausur: 5.9%. Über Bond A (1 Jahr): 98 = (100+4)·e^(−s₁·1) → s₁ = ln(104/98) ≈ 5.9%.

### (Q9) There are four traded bonds. No market frictions. Principal 100, all values in Euro. Table: Bond A: T=1, P=98, C=4.  Bond B: T=3, P=93, C=6 p.a.  Bond C: T=2, P=91, C=5 p.a.  Bond D: T=3, P=?, C1=2.5, C2=3.8, C3=4.2.  Use continuous compounding, round to three decimal places. Which of the following values is closest to the c.c. yearly zero rate with a maturity of 2 years? Hint: Assume a value of 0.058 for the zero rate with a maturity of 1 year to solve this task.
- [ ] 10.4%
- [ ] 6.1%
- [x] 9.8%
- [ ] 7.1%
> Erklärung: Richtige Antwort laut Klausur: 9.8%. Über Bond C (2 Jahre): 91 = 5·e^(−0.058·1) + 105·e^(−s₂·2) → s₂ ≈ 9.8%.

### (Q10) There are four traded bonds. No market frictions. Principal 100, all values in Euro. Table: Bond A: T=1, P=98, C=4.  Bond B: T=3, P=93, C=6 p.a.  Bond C: T=2, P=91, C=5 p.a.  Bond D: T=3, P=?, C1=2.5, C2=3.8, C3=4.2.  Use continuous compounding, round to three decimal places. Which of the following values is closest to the zero rate with a maturity of 3 years? Hint: Assume a value of 0.058 for the c.c. 1-year zero rate and 0.097 for the 2-year zero rate.
- [ ] 9.3%
- [ ] 9.9%
- [ ] 11.9%
- [x] 8.4%
> Erklärung: Richtige Antwort laut Klausur: 8.4%. Über Bond B (3 Jahre): 93 = 6·e^(−0.058·1) + 6·e^(−0.097·2) + 106·e^(−s₃·3) → s₃ ≈ 8.4%.

### (Q11) There are four traded bonds. No market frictions. Principal 100, all values in Euro. Table: Bond A: T=1, P=98, C=4.  Bond B: T=3, P=93, C=6 p.a.  Bond C: T=2, P=91, C=5 p.a.  Bond D: T=3, P=?, C1=2.5, C2=3.8, C3=4.2.  Use continuous compounding. Which of the following values is closest to the fair (arbitrage-free) market price of bond D? Assume c.c. zero rates of 0.058, 0.097 and 0.085 for maturities of 1, 2 and 3 years, respectively. Round to 2 decimal places in this task.
- [ ] 110.50
- [ ] 101.52
- [x] 86.24
- [ ] 85.63
> Erklärung: Richtige Antwort laut Klausur: 86.24. P_D = 2.5·e^(−0.058·1) + 3.8·e^(−0.097·2) + 104.2·e^(−0.085·3) ≈ 86.24.

### (Q12) What is most likely CORRECT? The implied volatility of an option is ...
- [ ] always smaller than the realized volatility
- [ ] equal for all options on the same underlying
- [x] the volatility that equates the Black-Scholes option price to the market price
- [ ] the observed stock price volatility over the last 250 trading days
> Erklärung: Richtige Antwort laut Klausur: Die implizite Volatilität ist die Vola, für die der Black-Scholes-Preis dem Marktpreis entspricht.

### (Q13) A corporation needs a €2 million six-month loan starting in one month (October 21, 2022) from now. A bank offers the company a loan today (September 21, 2022) at a fixed forward rate of 4% p.a. On the same day, the six-month EURIBOR-Future quotes at 98.2. Assume the bank is using the EURIBOR-Future for hedging this loan commitment. Which of the following values is closest to the overall undiscounted profits or losses the bank incurs, if the 6-month EURIBOR interest rate on October 21, 2022 is fixed at 3%?
- [ ] A loss of −15,500 €
- [ ] A loss of −22,500 €
- [ ] A profit of 15,500 €
- [x] A profit of 22,000 €
> Erklärung: Richtige Antwort laut Klausur: Gewinn von 22,000 €. Kreditzins-Gewinn (4% statt 3% auf 2 Mio, 6 Monate) plus/minus Future-Ergebnis aus der Kursänderung gegenüber 98.2.

### (Q14) Which of the following statements is most likely incorrect in the context of implied volatility?
- [ ] The implied volatility reflects the current market expectation on volatility
- [ ] None of the alternatives
- [x] The implied volatility of an option is usually estimated by the historical volatility of the underlying of the option
- [ ] The implied volatility of an option is the volatility for which the Black-Scholes price equals the market price
> Erklärung: Richtige Antwort laut Klausur (= die falsche Aussage): Implizite Vola wird NICHT über die historische Vola geschätzt, sondern aus dem Marktpreis der Option zurückgerechnet.

### (Q15) A bank is short in one Euro-Bund Future (FGBL) at EUREX with maturity June 10th, 2022. Contract volume EUR 100,000, delivery settlement price (DSP) EUR 158. The bank holds a portfolio of German Government bonds (face value EUR 100,000 each). No transaction costs, markets arbitrage-free. Table (Bond | Coupon | Maturity | Price on June 10, 2022 | Conversion Factor):  A | 2% | Jan 20, 2031 | 115.9 | 0.737489.  B | 2.5% | Feb 21, 2031 | 123.93 | 0.768551.  C | 3.5% | Aug 20, 2032 | 128.86 | ?.  D | 2% | Apr 21, 2032 | 113.01 | ?.  CF formula: CF = (1/1.06^f)·[ (c/6)·(1.06 − 1/1.06^n) + 1/1.06^n ] − c·(1−f)/100, with c = coupon rate in percent, n = integer years from next coupon date to maturity, f = full months to next coupon date / 12 (if f=0 then f:=1 and n:=n−1). Round conversion factors to 6 decimals. On June 10th, 2022, which of the four German Government bonds do you choose for delivery, i.e. which is the cheapest to deliver (CTD) bond?
- [ ] Bond B
- [ ] Bond D
- [x] Bond A
- [ ] Bond C
> Erklärung: Richtige Antwort laut Klausur: Bond A. CTD = Bond mit dem geringsten (Quoted Price − DSP·Conversion Factor).

### (Q16) A bank is short in one Euro-Bund Future (FGBL) at EUREX, maturity June 10th, 2022, contract volume EUR 100,000, DSP EUR 158. Bonds (face value EUR 100,000 each): A | 2% | Jan 20, 2031 | 115.9 | 0.737489.  B | 2.5% | Feb 21, 2031 | 123.93 | 0.768551.  C | 3.5% | Aug 20, 2032 | 128.86 | ?.  D | 2% | Apr 21, 2032 | 113.01 | ?.  No transaction costs, arbitrage-free. If markets are arbitrage free, which of the following values is closest to the final settlement price of the Euro-Bund-Future on June 10th, 2022?
- [x] 157.15
- [ ] 159.20
- [ ] 158.87
- [ ] 152.62
> Erklärung: Richtige Antwort laut Klausur: 157.15. Arbitragefreier Settlement-Preis = (Quoted Price der CTD-Anleihe) / (Conversion Factor der CTD).

### (Q17) A bank is short in one Euro-Bund Future (FGBL) at EUREX, contract volume EUR 100,000, DSP EUR 158. Bonds: A | 2% | Jan 20, 2031 | 115.9 | 0.737489.  B | 2.5% | Feb 21, 2031 | 123.93 | 0.768551.  C | 3.5% | Aug 20, 2032 | 128.86 | ?.  D | 2% | Apr 21, 2032 | 113.01 | ?.  Additional: money market rate 2.5% (yearly compounding); the Euro-Bund Future now matures on December 10th, 2022; only bonds C and D can be delivered; use 30/360 for interest days. CF = (1/1.06^f)·[ (c/6)·(1.06 − 1/1.06^n) + 1/1.06^n ] − c·(1−f)/100. Which of the following values is closest to the conversion factor of bond D?
- [ ] 0.8203
- [x] 0.7202
- [ ] 0.8346
- [ ] 0.7434
> Erklärung: Richtige Antwort laut Klausur: 0.7202. Bond D: c=2, Maturity April 21, 2032; f und n aus dem nächsten Kupontermin nach dem 10.12.2022 bestimmen und in die CF-Formel einsetzen.

### (Q18) A bank is short in one Euro-Bund Future (FGBL) at EUREX, contract volume EUR 100,000, DSP EUR 158. Bonds: A | 2% | Jan 20, 2031 | 115.9 | 0.737489.  B | 2.5% | Feb 21, 2031 | 123.93 | 0.768551.  C | 3.5% | Aug 20, 2032 | 128.86 | ?.  D | 2% | Apr 21, 2032 | 113.01 | ?.  Money market rate 2.5% yearly, Future matures December 10th, 2022, only bonds C and D deliverable, 30/360. Assume bond C is the CTD-bond for the December contract and its conversion factor is 0.7900. By implementing a "Cash and Carry"-arbitrage and taking into account the accrued interest you will get when delivering the bond on December 10th, 2022, which of the following values is closest to the arbitrage-free future price?
- [ ] 128.72
- [x] 162.94
- [ ] 101.69
- [ ] 143.57
> Erklärung: Richtige Antwort laut Klausur: 162.94. Cash-and-Carry: (Kaufpreis+Stückzins der CTD, aufgezinst mit 2.5% − erhaltene Stückzinsen bei Lieferung) / Conversion Factor 0.7900.

### (Q19) Which of the following statements is most likely not a correct characteristic of OTC derivative markets?
- [x] Standardized trading parameters
- [ ] A computer- and telephone-linked network of dealers at financial institutions, corporations, and fund managers
- [ ] Financial instruments are traded directly between two parties
- [ ] There is some small amount of credit risk
> Erklärung: Richtige Antwort laut Klausur (= die falsche Charakteristik): OTC-Märkte sind gerade nicht standardisiert – Standardisierung ist typisch für Börsenhandel.

### (Q20) Consider a forward exchange rate contract with time to maturity of two years from the perspective of a British investor. The spot rate today is 0.48 £/C$ (price quotation). The 2-year c.c. interest rates in the UK and in Canada are 1.5% and 3%, respectively. What is the arbitrage-free 2-year forward exchange £/C$?
- [ ] 0.4946
- [x] 0.4658
- [ ] 0.4729
- [ ] 0.4873
> Erklärung: Richtige Antwort laut Klausur: 0.4658. F = S₀·e^((r_UK − r_CA)·T) = 0.48·e^((0.015−0.03)·2) ≈ 0.4658.

### (Q21) On Feb. 10, 2022, the spot price of a barrel crude oil is 90 USD. The short term USD interest rate is 2.1% p.a. with continuous compounding. The storage cost are 3.1% p.a. with continuous compounding. Which of the following values is closest to the arbitrage free price of the Future with maturity in eight months from now?
- [x] 93.2
- [ ] 91.3
- [ ] 94.8
- [ ] 89.4
> Erklärung: Richtige Antwort laut Klausur: 93.2. F = S₀·e^((r+u)·T) = 90·e^((0.021+0.031)·(8/12)) ≈ 93.2.

### (Q22) On Feb. 10, 2022, the spot price of a barrel crude oil is 90 USD. The short term USD interest rate is 2.1% p.a. with continuous compounding. The storage cost are 3.1% p.a. with continuous compounding. Assume the future price with maturity in eight months from now is 90.89 USD. Which of the following values is closest to the convenience yield that we can deduce from this price?
- [ ] 4.22%
- [ ] 6.68%
- [x] 3.72%
- [ ] 0.48%
> Erklärung: Richtige Antwort laut Klausur: 3.72%. Aus F = S₀·e^((r+u−y)·T) → y = r + u − (1/T)·ln(F/S₀) ≈ 3.72%.

### (Q23) Which of the following statements is most likely incorrect in the context of credit default swaps?
- [x] The seller of the protection has to make regular payments to the buyer (an insurance premium), except if there is a credit event, which eliminates all remaining obligations of the seller
- [ ] Cash settlement means that in case of a credit event the buyer of the protection receives cash payment depending on the market value of the bonds
- [ ] The buyer of the protection pays a periodic fee until the end of the life of the CDS which is called the credit default spread and measured in percentage of the principal
- [ ] Physical settlement means that in case of a credit event the buyer of the protection has the right to sell bonds issued by the entity for their face value
> Erklärung: Richtige Antwort laut Klausur (= die falsche Aussage): Vertauscht – der KÄUFER (nicht der Verkäufer) des Schutzes zahlt die regelmäßige Prämie an den Verkäufer.

### (Q24) The spot price of an investment asset today (t = 0) is 115 €. In 6 and 12 months from now the asset will generate an income of 6.5 € per unit. The riskless interest rates with continuous compounding are: 6 months: 3.2% p.a.; 12 months: 4.5% p.a.; 15 months: 4.6% p.a. Which of the following values is closest to today's (t = 0) fair price of a forward contract on this asset with time to maturity equal to 15 months? Assume there are no storage costs.
- [ ] 122
- [x] 108
- [ ] 121
- [ ] 135
> Erklärung: Richtige Antwort laut Klausur: 108. F = (S₀ − PV der Einkünfte)·e^(r_15·1.25), mit PV = 6.5·e^(−0.032·0.5) + 6.5·e^(−0.045·1).

### (Q25) Consider a forward contract with time to maturity of 3.75 years. Assume you entered a long position in the contract 15 months ago (in t = 0). The forward price at that time is 180 EUR. The risk-free rate is 1.75%. The forward price today (i.e. 15 months later) is 201 EUR. Which of the following values is closest to the value of the forward contract today?
- [ ] 19.666
- [ ] 20.546
- [x] 20.101
- [ ] 20.636
> Erklärung: Richtige Antwort laut Klausur: 20.101. f = (F_t − F_0)·e^(−r·T_rest), Restlaufzeit = 3.75 − 1.25 = 2.5 Jahre: (201−180)·e^(−0.0175·2.5) ≈ 20.101.

### (Q26) Two banks in the past have entered into a swap agreement exchanging 6-month LIBOR against a 0.5% fixed rate payment with semi-annual compounding. The maturity of the swap is 1.25 years, the notional is EUR 100mn, payments are made semi-annually and the next payment date is in 3 months from now. Today the continuously compounded LIBOR rates for maturities of 3, 9 and 15 months are −0.50%, −0.25% and 0.75% (swap rates are identical). The 6-month LIBOR rate at the last payment date was −0.50% with semi-annual compounding. What is the value of the fixed-rate payer leg in the swap in EUR mn (assuming principals are exchanged as well)?
- [ ] 99.87
- [ ] 99.62
- [x] 99.82
- [ ] 100.07
> Erklärung: Richtige Antwort laut Klausur: 99.82. Bewertung als Bond: fixe Kupons (0.25% je Halbjahr) + Nominal, diskontiert mit den c.c. LIBOR-Sätzen für 3/9/15 Monate.

### (Q27) Assume that Companies A and B can issue bonds at the following interest rates: Company A: Fixed rate 4.1%, Floating rate LIBOR + 1.1%. Company B: Fixed rate 2.75%, Floating rate LIBOR + 0.75%. Which of the following statements is most likely CORRECT:
- [x] Company A has a comparative advantage on floating rate markets
- [ ] Company A has a comparative advantage on both fixed and floating rate markets
- [ ] Company B has a comparative advantage on floating rate markets
- [ ] All answers are wrong
> Erklärung: Richtige Antwort laut Klausur: Company A hat den komparativen Vorteil im Floating-Markt. Differenz fix = 1.35%, Differenz floating = 0.35% → A ist relativ günstiger bei floating.

### (Q28) Assume that Companies A and B can issue bonds at the following interest rates: Company A: Fixed rate 4.1%, Floating rate LIBOR + 1.1%. Company B: Fixed rate 2.75%, Floating rate LIBOR + 0.75%. Compared to the situation where A issues a fixed rate bond and B a floating rate bond, what would be the maximum interest saving the two companies can realize, if they enter into an appropriate swap agreement, taking into account that the financial intermediary arranging this swap takes a fee of 0.2% from A and 0.2% from B?
- [ ] 0.70%
- [ ] 0.35%
- [x] 0.60%
- [ ] 1.35%
> Erklärung: Richtige Antwort laut Klausur: 0.60%. Gesamtvorteil = |1.35% − 0.35%| = 1.00%, abzüglich Intermediär-Fee von 2·0.2% = 0.4% → 0.60%.

### (Q29) A bank is selling a CDS contract for the XY corporation. The swap curve displays c.c. interest rates of −1%, 0.5%, and 2% for maturities of 1, 2 and 3 years, respectively. The risk-neutral yearly default probability of this company is assumed to be 3.5% and the recovery rate 55%. All payments are made by the end of the year; also defaults only happen by the end of the year. Assume a CDS spread of 290 bp. What is the expected PV of the CDS spread payment made by the protection buyer (in basis points)?
- [ ] 806.81
- [ ] 826.55
- [x] 795.46
- [ ] 823.28
> Erklärung: Richtige Antwort laut Klausur: 795.46. Erwarteter PV = Spread · Σ (Überlebenswahrscheinlichkeit bis t · Diskontfaktor_t) über t = 1, 2, 3.

### (Q30) A bank is selling a CDS contract for the XY corporation. The swap curve displays c.c. interest rates of −1%, 0.5%, and 2% for maturities of 1, 2 and 3 years. The risk-neutral yearly default probability is 3.5% and the recovery rate 55%. All payments are made by the end of the year; defaults only happen by the end of the year. What is the expected PV of the LGD payment made by the protection seller in the CDS expressed in % of the nominal value?
- [ ] 5.47%
- [ ] 4.65%
- [x] 4.48%
- [ ] 4.58%
> Erklärung: Richtige Antwort laut Klausur: 4.48%. Erwarteter PV = LGD (=1−0.55) · Σ (Ausfallwahrscheinlichkeit in t · Diskontfaktor_t) über t = 1, 2, 3.

### (Q31) Assume the expected PV of a CDS spread payment made by the protection buyer is 3.9 times the spread. The expected PV of the LGD payment made by the protection seller is 2.75% of the nominal CDS value. What is the fair CDS spread expressed in basis points of the nominal value closest to?
- [x] 70.51
- [ ] 88.85
- [ ] 99.73
- [ ] 58.96
> Erklärung: Richtige Antwort laut Klausur: 70.51. Fairer Spread = LGD-Bein / Spread-Faktor = 2.75% / 3.9 ≈ 0.7051% = 70.51 bp.

### (Q32) Assume that a CDS index has a quoted spread of 250 bp. The standardized coupon is 3% and the risky PV is 2.55. What is the quoted price of this index?
- [ ] 103.05
- [ ] 98.73
- [ ] 93.63
- [x] 101.28
> Erklärung: Richtige Antwort laut Klausur: 101.28. Preis = 100 + (Coupon − Spread)·risky PV = 100 + (3% − 2.5%)·2.55·100 ≈ 101.28.

### (Q33) The price of a European put option that expires in 8 months and has a strike price of 49 EUR is 4.50 EUR. The stock price is 52 EUR and the c.c. risk free rate is 3%. What is the price of a European call option that expires at the same day as the European put and has the same strike price?
- [ ] 8.95
- [ ] 7.50
- [ ] 5.30
- [x] 8.47
> Erklärung: Richtige Antwort laut Klausur: 8.47. Put-Call-Parität: C = P + S₀ − K·e^(−r·T) = 4.50 + 52 − 49·e^(−0.03·8/12) ≈ 8.47.

### (Q34) Which of the following statements is most likely NOT CORRECT:
- [ ] In-the-money for a put option implies that the strike price of the put is higher than the market price of the underlying
- [ ] The time value of an option is the amount by which the option price exceeds its (non-negative) intrinsic value
- [x] Out-of-the-money for a call option implies that the market price of the underlying is higher than the strike price of the call
- [ ] At-the-money implies that the strike price is equal to the market price of the underlying
> Erklärung: Richtige Antwort laut Klausur (= die falsche Aussage): Ein Call ist out-of-the-money, wenn der Marktpreis UNTER dem Strike liegt (nicht darüber).

### (Q35) There is a European put option with the following parameters: K = 42 EUR, r (c.c.) = 3%, T = 1.75 years, volatility = 40%. The stock price is at 43 EUR today. It is known that the stock will pay a dividend of 1.5 EUR in 9 months from now. What is the Black-Scholes value of this option closest to? Hint: round all intermediate results to 2 decimal points, but use 4 digit probability numbers from the standard normal distribution function.
- [x] 7.68
- [ ] 7.87
- [ ] 9.36
- [ ] 9.02
> Erklärung: Richtige Antwort laut Klausur: 7.68. Zuerst Dividende abziehen: S₀* = 43 − 1.5·e^(−0.03·0.75), dann Black-Scholes-Put mit S₀*, K=42, r=3%, σ=40%, T=1.75.

### (Q36) What is NOT an assumption in the Black/Scholes model?
- [ ] Options are of European type
- [ ] Stock prices follow a geometric Brownian motion
- [x] Stock prices are normally distributed
- [ ] Frictionless continuous trading
> Erklärung: Richtige Antwort laut Klausur (= keine BS-Annahme): Aktienkurse sind log-normalverteilt (die Renditen sind normalverteilt), nicht die Kurse selbst.

### (Q37) Which of the following events most likely implies the highest change in option characteristics, that is in the strike price and in the amount of the underlying: (Mehrfachauswahl)
- [x] A 7:5 stock split, i.e. for 5 old stocks 7 new stocks are issued
- [x] A 40% cash dividend
- [x] A 5:7 stock split
- [x] A 49% stock dividend, i.e. for 1 old stock 0.49 new stocks are issued
> Erklärung: Laut Klausur werden alle vier Ereignisse als korrekt gewertet (alle führen zu einer Anpassung von Strike und/oder Kontraktgröße).
