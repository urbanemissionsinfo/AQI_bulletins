import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.colors import ListedColormap
import os
import sys
import numpy as np
import warnings
from datetime import datetime, timedelta
import calendar as cal

# Ignore all warnings
warnings.filterwarnings("ignore")

if len(sys.argv) != 2:
    print("Usage: python script.py city_name")
    sys.exit(0)

city = sys.argv[1]

# Read and prepare data
df = pd.read_csv(os.getcwd() + '/data/Processed/AllIndiaBulletinsMaster2025_openrefined.csv')
df = df[df['city'] == city]
df['date'] = pd.to_datetime(df['date'])

# Clean no_stations column
df['no_stations'] = df['no_stations'].apply(lambda x: str(x).replace('(', ' '))
df['no_stations'] = df['no_stations'].apply(lambda x: str(x).replace('!', ''))
df['no_stations'] = df['no_stations'].apply(lambda x: str(x).split(' ')[0])
df.replace('', np.nan, inplace=True)
df['no_stations'] = df['no_stations'].astype(float)

# Calculate average stations per year
result = df.groupby(df.date.dt.year)['no_stations'].mean().reset_index()
result = result.fillna(0)

# Define AQI color scheme
aqi_colors = ['#9e9e9e',  # Grey for missing data
              '#274e13', '#93c47d', '#f2f542', '#f59042', '#ff0000', '#753b3b']
aqi_labels = ['No Data', 'Good (0-50)', 'Satisfactory (51-100)', 
              'Moderate (101-200)', 'Poor (201-300)', 
              'Very Poor (301-400)', 'Severe (>400)']

# Categorize AQI values
conditions = [
    (df['aqi'].isna()),
    (df['aqi'] <= 50),
    (df['aqi'] > 50) & (df['aqi'] <= 100),
    (df['aqi'] > 100) & (df['aqi'] <= 200),
    (df['aqi'] > 200) & (df['aqi'] <= 300),
    (df['aqi'] > 300) & (df['aqi'] <= 400),
    (df['aqi'] > 400)
]
categories = [0, 1, 2, 3, 4, 5, 6]
df['aqi_category'] = np.select(conditions, categories, default=0)

# Create custom calendar heatmap function
def plot_year_calendar(ax, year_data, year, avg_stations):
    """Plot a calendar heatmap for a single year with correct month boundaries"""
    
    year_start = datetime(year, 1, 1)
    year_end = datetime(year, 12, 31)
    date_range = pd.date_range(start=year_start, end=year_end, freq='D')
    
    year_df = pd.DataFrame({'date': date_range})
    year_df = year_df.merge(year_data[['date', 'aqi_category']], on='date', how='left')
    year_df['aqi_category'] = year_df['aqi_category'].fillna(0)
    
    year_df['dayofweek'] = year_df['date'].dt.dayofweek
    # Align weeks so Jan 1st is always in Week 0
    year_df['week'] = ((year_df['date'] - year_start).dt.days + year_start.weekday()) // 7
    year_df['month'] = year_df['date'].dt.month
    
    pivot = year_df.pivot_table(values='aqi_category', 
                                 index='dayofweek', 
                                 columns='week', 
                                 fill_value=np.nan)
    
    cmap = ListedColormap(aqi_colors)
    cmap.set_bad(color='white')
    
    im = ax.imshow(pivot, aspect='auto', cmap=cmap, vmin=0, vmax=6, interpolation='nearest')
    
    # Month Demarcation Logic
    for month in range(1, 12):
        last_day_m = year_df[year_df['month'] == month].iloc[-1]
        w, d = last_day_m['week'], last_day_m['dayofweek']
        #Vertical line
        ax.plot([w - 0.5, w - 0.5], [6.5, d + 0.5], color='black', lw=2)
        #Horizontal Line
        ax.plot([w + 0.5, w - 0.5], [d+0.5, d+0.5], color='black', lw=2)
        #Vertical Line
        ax.plot([w + 0.5, w + 0.5], [d + 0.5, -0.5], color='black', lw=2)

    # Styling
    ax.set_yticks(range(7))
    ax.set_yticklabels(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], fontsize=12, fontweight='bold')
    
    # Month Labels at the center of each month's weeks
    month_labels = []
    month_ticks = []
    for m in range(1, 13):
        m_weeks = year_df[year_df['month'] == m]['week']
        month_ticks.append(m_weeks.mean())
        month_labels.append(cal.month_name[m][:3])
    
    ax.set_xticks(month_ticks)
    ax.set_xticklabels(month_labels, fontsize=14, fontweight='bold')
    
    ax.set_title(f'{year} (Avg stations: {avg_stations:.1f})', fontsize=18, fontweight='bold')
    
    # Grid and Spines
    ax.set_xticks(np.arange(-0.5, pivot.shape[1], 1), minor=True)
    ax.set_yticks(np.arange(-0.5, 7, 1), minor=True)
    ax.grid(which='minor', color='white', linestyle='-', linewidth=1.5)
    return im
# Get unique years and sort them
years = sorted(df['date'].dt.year.unique())
n_years = len(years)

print(f"Processing {n_years} years: {years}")

# Calculate number of rows needed (2 years per row)
n_rows = (n_years + 1) // 2

# Create figure with subplots (n_rows x 2 columns)
fig, axes = plt.subplots(n_rows, 2, 
                         figsize=(24, n_rows * 3))

# Ensure axes is 2D
if n_rows == 1:
    axes = axes.reshape(1, 2)

# Plot years in pairs (2015, 2016 in row 0; 2017, 2018 in row 1; etc.)
for i, year in enumerate(years):
    row = i // 2  # Integer division to get row number
    col = i % 2   # Modulo to get column (0 or 1)
    
    print(f"Plotting year {year} at position ({row}, {col})")
    
    # Get data for this specific year
    year_data = df[df['date'].dt.year == year].copy()
    
    # Get average stations for this year
    avg_stations = result[result['date'] == year]['no_stations'].values
    avg_stations = avg_stations[0] if len(avg_stations) > 0 else 0
    
    print(f"  Year {year}: {len(year_data)} records, avg stations: {avg_stations:.1f}")
    
    plot_year_calendar(axes[row, col], year_data, year, avg_stations)

# Hide the last subplot if odd number of years
if n_years % 2 == 1:
    axes[n_rows - 1, 1].axis('off')

# Add main title
fig.suptitle(f'Air Quality Index Calendar Heatmap: {city} (2015-2025)', 
             fontsize=28, fontweight='bold', y=0.998)

# Add legend
legend_patches = [mpatches.Patch(color=aqi_colors[i], label=aqi_labels[i]) 
                  for i in range(len(aqi_labels))]
fig.legend(handles=legend_patches, loc='lower center', ncol=7, 
           fontsize=16, frameon=True, bbox_to_anchor=(0.5, -0.01))

plt.tight_layout(rect=[0, 0.02, 1, 0.99])

# Save
output_path = os.getcwd() + f'/plots/calendarheats/{city}_calendarhm_2col.png'
os.makedirs(os.path.dirname(output_path), exist_ok=True)
plt.savefig(output_path, dpi=150, bbox_inches='tight')
print(f"\nCalendar heatmap saved to: {output_path}")
plt.close()