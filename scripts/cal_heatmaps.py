import pandas as pd
import matplotlib.pyplot as plt
import calplot
from matplotlib.colors import ListedColormap, BoundaryNorm
from matplotlib.cm import ScalarMappable
import os
import sys
import numpy as np
import warnings

# Ignore all warnings
warnings.filterwarnings("ignore")

if len(sys.argv) !=2:
    print("Usage: scripts/cal_heatmaps.py city_name")
    sys.exit(0)

city = sys.argv[1]
from PIL import Image

def join_images_vertically(image1_path, image2_path, output_path):
    # Open images
    image1 = Image.open(image1_path)
    image2 = Image.open(image2_path)
    
    # Determine the width and height of the output image
    width = max(image1.width, image2.width)
    height = image1.height + image2.height
    
    # Create a new blank image with the calculated dimensions
    new_image = Image.new("RGB", (width, height))
    
    # Paste the first image at the top
    new_image.paste(image1, (0, 0))
    
    # Paste the second image below the first one
    new_image.paste(image2, (0, image1.height))
    
    # Save the result
    new_image.save(output_path)

# Create a dataframe with a single column - dates from 2015 to 2023
daily_dates = pd.date_range(start='2015-01-01', end='2023-12-31', freq='D')
template = pd.DataFrame({'date': daily_dates})

df = pd.read_csv(os.getcwd() + '/data/Processed/AllIndiaBulletins_Master.csv')
df = df[df['City']==city]
df['date'] = pd.to_datetime(df['date'])
df = template.merge(df, on='date', how='left') #Remove this code if you dont want years without data in calendar

##
df['No. Stations'] = df['No. Stations'].apply(lambda x: str(x).replace('(', ' '))
df['No. Stations'] = df['No. Stations'].apply(lambda x: str(x).replace('!', ''))
df['No. Stations'] = df['No. Stations'].apply(lambda x: str(x).split(' ')[0])
df.replace('', np.nan, inplace=True)
df['No. Stations'] = df['No. Stations'].astype(float)

result = df.groupby(df.date.dt.year)['No. Stations'].mean().reset_index()
num_years = result.date.nunique()
#print(result)
df.set_index('date', inplace=True)

# Replace all NULLS with -1 (grey out on map)
df = df.fillna(-1)

## CALENDAR HEATMAP
# Define the colormap ranges and colors
aqi_ranges = [0, 50, 100, 200, 300, 400, 500]
aqi_colors = ['#eeeeeeff', # Null values are replaced with -1 - this color is for that - remove it if null calendary years are not needed
              '#274e13ff', '#93c47dff', '#f2f542', '#f59042', '#ff0000', '#753b3b']


# Define the conditions for each category
conditions = [
    (df['Index Value'] < 0), # Null values are replaced with -1 - this category is for that - remove it if null calendary years are not needed
    (df['Index Value'] <= 50),
    (df['Index Value'] > 50) & (df['Index Value'] <= 100),
    (df['Index Value'] > 100) & (df['Index Value'] <= 200),
    (df['Index Value'] > 200) & (df['Index Value'] <= 300),
    (df['Index Value'] > 300) & (df['Index Value'] <= 400),
    (df['Index Value'] > 400)
]

categories = [1, 2, 3, 4, 5, 6, 7] #Should be 6 - +1 for the null value category.
df['AQI'] = np.select(conditions, categories, default='outlier')
df['AQI'] = df['AQI'].astype(int)

aqi_colors = [aqi_colors[i-1] for i in sorted(df['AQI'].unique())]
#print(sorted(df['AQI'].unique()))
#print(aqi_colors)
# Create a custom discrete colormap for AQI
cmap = ListedColormap(aqi_colors)
#norsm = BoundaryNorm(aqi_ranges, cmap.N, clip=True)

if len(city) < 12:
    title_font_size = 40
else:
    title_font_size = 35
calplot.calplot(df['AQI'],
                yearascending = True,
                colorbar = False,

                yearlabels = True,
                yearlabel_kws = {'fontsize': 30, 'color': 'black', 'fontname':'sans-serif'},

                suptitle = "AQI Reported in CPCB's Daily Bulletins for "+ city,
                suptitle_kws = {'fontsize': title_font_size, 'x': 0.5, 'y': 0.995, 'fontweight':'bold', 'fontname':'sans-serif'},
                
                cmap=cmap,

                linecolor = 'white', linewidth = 1,
                edgecolor = 'black',

                #textformat = '{:.0f}', textfiller = '-', textcolor = 'black'

                figsize=(20,num_years*3.67)
                )
# Iterate over each subplot and set xtick labels to bold
for ax in plt.gcf().get_axes():
    fontsize = 28
    fontweight = 'bold'
    fontproperties = {'weight' : fontweight, 'size' : fontsize}
    ax.set_xticklabels(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], fontdict = fontproperties)
    #ax.tick_params(axis="x", labelsize=28, weight='bold')
#plt.xticks(fontweight='bold', fontsize=28)

plt.savefig(os.getcwd() + '/plots/calendarheats/{}_calendarhm.png'.format(city))
plt.close()

result = result.fillna(0)

plt.figure(figsize=(20,8))  
plt.bar(result.date, result['No. Stations'], )
plt.title('Average number of stations reporting', fontsize=40, fontweight='bold')
plt.xticks(result.date, fontweight='bold', fontsize=25)
ytick_stepsize = round(max(result['No. Stations'].dropna())/5, 1)
if ytick_stepsize>1:
    ytick_stepsize = round(ytick_stepsize,0)
plt.yticks(np.arange(ytick_stepsize, max(result['No. Stations'].dropna())+ytick_stepsize, ytick_stepsize), fontweight='bold', fontsize=25)

plt.xlabel('Year', fontsize=30)
plt.savefig(os.getcwd() + '/plots/calendarheats/{}_stations.png'.format(city))



# Join images:
join_images_vertically(os.getcwd() + '/plots/calendarheats/{}_calendarhm.png'.format(city),
                       os.getcwd() + '/assets/aqi_bands.png'.format(city),
                       os.getcwd() + "/plots/calendarheats/{}_calendarhm.png".format(city))

join_images_vertically(os.getcwd() + '/plots/calendarheats/{}_calendarhm.png'.format(city),
                       os.getcwd() + '/plots/calendarheats/{}_stations.png'.format(city),
                       os.getcwd() + "/plots/final_calendarheats/{}_calendarhm_stations.png".format(city))