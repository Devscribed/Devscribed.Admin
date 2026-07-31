# Project Metrics

## Summary

Almost each of our clients has their own RevenueCat and Mixpanel dashboards. For each project where it makes sense we want to understand the next metrics: LTV, Conversions, Retention, Revenue, etc. 

## Metrics

### 1. Lifetime Value

We take Lifetime Value (LTV) from RevenueCat "Realized LTV per Paying Customer" report. There are multiple settings for this report that we will be playing with: Customer Lifetime (30 days, 90 days, unbounded, etc), Period (daily, weekly, monthly, etc), Date Range (custom dates that we want to use for calculations to start from and end at). 

Date Range can be custom, but when we refer to a LTV for July 2026, we mean 08/01/25-07/31/26 (so the entire year since August of the previous year).  

#### 1.1 30-day LTV

This metric calculates average LTV for the last 12 months that we get during the first month of each user subscription. 

Settings for the "Realized LTV per Paying Customer" report:
1. Customer Lifetime: 30 days
2. Period: Monthly
3. Date Range: current month

Result: We will have 12 30-day LTVs for each month of the previous year and until the month that we are interested in. The result is an average of these values (sum of 12 LTVs divided by 12).

#### 1.2 90-day LTV

This metric calculates average LTV for the last 12 months that we get during the first 3 months of each user subscription. 

Settings for the "Realized LTV per Paying Customer" report:
1. Customer Lifetime: 90 days
2. Period: Monthly
3. Date Range: current month

Result: We will have 12 90-day LTVs for each month of the previous year and until the month that we are interested in. The result is an average of these values (sum of 12 LTVs divided by 12).

#### 1.3 12 months average unbounded LTV

This metric calculates average LTV for the last 12 months that we get during the entire user subscription lifetime. 

Settings for the "Realized LTV per Paying Customer" report:
1. Customer Lifetime: Unbounded
2. Period: Monthly
3. Date Range: current month

Result: We will have 12 90-day LTVs for each month of the previous year and until the month that we are interested in. The result is an average of these values (sum of 12 LTVs divided by 12).

#### 1.4 24 months average unbounded LTV

This metric calculates average LTV for the last 24 months that we get during the entire user subscription lifetime. 

Settings for the "Realized LTV per Paying Customer" report:
1. Customer Lifetime: Unbounded
2. Period: Monthly
3. Date Range: current month

Result: We will have 12 90-day LTVs for each month of the previous year and until the month that we are interested in. The result is an average of these values (sum of 12 LTVs divided by 12).

