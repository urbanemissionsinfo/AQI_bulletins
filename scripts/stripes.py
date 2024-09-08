import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from matplotlib.collections import PatchCollection
from matplotlib.colors import ListedColormap
import pandas as pd
import numpy as np
import matplotlib as mpl
import sys
import os
import warnings
# Ignore all warnings
warnings.filterwarnings("ignore")
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


if len(sys.argv) !=2:
    print("Usage: scripts/stripes.py city_name")
    sys.exit(0)

city = sys.argv[1]

master_df = pd.read_csv(os.getcwd()+r'/data/Processed/AllIndiaBulletins_Master.csv')
master_df = master_df[master_df.City == city]
master_df['date'] = pd.to_datetime(master_df['date'])


for year in master_df['date'].dt.year.unique()[1:]:
    daily_dates = pd.date_range(start=str(year)+'-01-01', end=str(year)+'-12-31', freq='D')
    template = pd.DataFrame({'date': daily_dates})

    df = template.merge(master_df, on='date', how='left') #Remove this code if you dont want dates without data in calendar
    df = df.fillna(-1)

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

    aqi_colors = ['#eeeeeeff', # Null values are replaced with -1 - this color is for that - remove it if nulls are not needed
              '#274e13ff', '#93c47dff', '#f2f542', '#f59042', '#ff0000', '#753b3b']


    aqi_colors = [aqi_colors[i-1] for i in sorted(df['AQI'].unique())]
    # Create a custom discrete colormap for AQI
    cmap = ListedColormap(aqi_colors)
    aqi_ranges = [0, 50, 100, 200, 300, 400, 500]
    norm = mpl.colors.BoundaryNorm(aqi_ranges, 6)

    # Create the plot
    fig,ax = plt.subplots(figsize=(20, 4))
    # create a collection with a rectangle for each year
    col = PatchCollection([Rectangle((y, 0), 1, 1) for y in range(0, 365 + 1)], zorder=1)
    # set data, colormap and color limits
    col.set_array(df['Index Value'])
    col.set_cmap(cmap)
    col.set_norm(norm)

    ax.add_collection(col)

    ax.set_ylim(0, 1)
    ax.set_xlim(0, 365)
    ax.yaxis.set_visible(False)
    ax.xaxis.set_visible(False)

    ax.set_title(city+', '+str(year), fontsize=20, loc='left', y=1.03)
    plotfile = city+'_'+str(year)+'_pollution-stripes.png'
    fig.savefig(os.getcwd()+r'/plots/'+plotfile, bbox_inches='tight', facecolor='white')

#join_images_vertically(image1_path, image2_path, output_path)
# Join images:
join_images_vertically(os.getcwd() + r'/assets/aqi_bands_1570.png',
                       os.getcwd() + r'/plots/{}_{}_pollution-stripes.png'.format(city, master_df['date'].dt.year.unique()[1]),
                       os.getcwd() + r"/plots/{}_pollution-stripes.png".format(city))

for year in master_df['date'].dt.year.unique()[2:]:
    join_images_vertically(os.getcwd() + r"/plots/{}_pollution-stripes.png".format(city),
                        os.getcwd() + r'/plots/{}_{}_pollution-stripes.png'.format(city, year),
                        os.getcwd() + r"/plots/{}_pollution-stripes.png".format(city))