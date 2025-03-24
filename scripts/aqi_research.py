import pandas as pd
import matplotlib.pyplot as plt
import os
import numpy as np

df = pd.read_csv(os.getcwd() + '/data/Processed/AllIndiaBulletins_Master_2024.csv')
df['No. Stations'] = df['No. Stations'].apply(lambda x: str(x).replace('(', ' '))
df['No. Stations'] = df['No. Stations'].apply(lambda x: str(x).replace('!', ' '))
df['No. Stations'] = df['No. Stations'].apply(lambda x: str(x).split(' ')[0])
df.replace('', np.nan, inplace=True)
df = df.dropna()

df['date'] = pd.to_datetime(df['date'])
df['No. Stations'] = df['No. Stations'].astype(float)
df['year'] = df['date'].dt.year
df['month'] = df['date'].dt.month
df['day365'] = df['date'].dt.dayofyear

#df.City.value_counts().to_csv(os.getcwd() + '/data/Processed/cities.csv')
# for city in df.City.unique():
#     df[df.City==city].to_csv(os.getcwd() + '/data/Processed/Citywise/{}_AQIBulletins.csv'.format(city), index=False)
# exit()
# 1. total unique cities being monitored by year 
unique_cities_per_year = df.groupby('year')['City'].nunique()
unique_cities_per_year.to_csv(os.getcwd() + '/data/Results/unique_cities_per_year.csv')
unique_cities_per_year.plot(x='year',
                            kind='bar',
                            figsize=(15,10))

plt.xticks(fontweight='bold', rotation=0, fontsize=15)
plt.yticks(fontweight='bold', fontsize=15)
plt.xlabel('Year', fontweight='bold', fontsize=20)
plt.ylabel('No. of Cities', fontweight='bold', fontsize=20)
plt.title('Number of Cities with Monitoring Stations', fontsize=25, fontweight='bold')
plt.tight_layout()
plt.savefig(os.getcwd() + '/plots/Results/unique_cities_per_year.png')
plt.close()

# 2. total unique cities by month
unique_cities_per_month = df.groupby(['year', 'month'])['City'].nunique()
unique_cities_per_month.to_csv(os.getcwd() + '/data/Results/unique_cities_per_month.csv')
unique_cities_per_month = unique_cities_per_month.reset_index()
unique_cities_per_month['date'] = unique_cities_per_month['year'].astype(str) + '-' + unique_cities_per_month['month'].astype(str)

unique_cities_per_month.plot(x='date', y='City',
                            kind='bar',
                            figsize=(15,10))
selected_ticks = [0] + list(range(12, unique_cities_per_month['date'].shape[0], 12))  # First, 13th, 26th, etc.
plt.xticks(selected_ticks, fontweight='bold', rotation=0, fontsize=15)
plt.yticks(fontweight='bold', fontsize=15)
plt.xlabel('Month', fontweight='bold', fontsize=20)
plt.ylabel('No. of Cities', fontweight='bold', fontsize=20)
plt.title('Number of Cities with Monitoring Stations', fontsize=25, fontweight='bold')
plt.tight_layout()
# Remove legend box
plt.legend().remove()
plt.savefig(os.getcwd() + '/plots/Results/unique_cities_per_month.png')
plt.close()

# 3. total number of monitoring stations by year
## Total number of stations on any day
num_stations = df.groupby(['year','day365'])['No. Stations'].sum().reset_index()

## Considering max number of stations in a year as "num stations in that year"
num_stations_per_year = num_stations.groupby('year').max().reset_index()
num_stations_per_year = num_stations_per_year[['year', 'No. Stations']]
num_stations_per_year.to_csv(os.getcwd() + '/data/Results/num_stations_per_year.csv')

num_stations_per_year.plot(x='year',
                           kind='bar',
                           figsize=(15,10))

plt.xticks(fontweight='bold', rotation=0, fontsize=15)
plt.yticks(fontweight='bold', fontsize=15)
plt.xlabel('Year', fontweight='bold', fontsize=20)
plt.ylabel('No. of Stations', fontweight='bold', fontsize=20)
plt.title('Number of Monitoring Stations', fontsize=25, fontweight='bold')
plt.tight_layout()
plt.legend().remove()
plt.savefig(os.getcwd() + '/plots/Results/num_stations_per_year.png')
plt.close()

# 4. total number of monitoring stations by month
## Total number of stations on any day
num_stations = df.groupby(['year', 'month', 'day365'])['No. Stations'].sum().reset_index()

## Considering max number of stations in a month as "num stations in that year"
num_stations_per_month = num_stations.groupby(['year','month']).max().reset_index()
num_stations_per_month = num_stations_per_month[['year', 'month', 'No. Stations']]
num_stations_per_month.to_csv(os.getcwd() + '/data/Results/num_stations_per_month.csv')
num_stations_per_month['date'] = num_stations_per_month['year'].astype(str) + '-' + num_stations_per_month['month'].astype(str)

num_stations_per_month.plot(x='date', y='No. Stations',
                            kind='bar',
                            figsize=(15,10))
selected_ticks = [0] + list(range(12, num_stations_per_month['date'].shape[0], 12))  # First, 13th, 26th, etc.
plt.xticks(selected_ticks, fontweight='bold', rotation=0, fontsize=15)
plt.yticks(fontweight='bold', fontsize=15)
plt.xlabel('Month', fontweight='bold', fontsize=20)
plt.ylabel('No. of Stations', fontweight='bold', fontsize=20)
plt.title('Number of Monitoring Stations', fontsize=25, fontweight='bold')
plt.tight_layout()
# Remove legend box
plt.legend().remove()
plt.savefig(os.getcwd() + '/plots/Results/num_stations_per_month.png')
plt.close()


# 5. Average number of monitoring stations by year (I am assuming this is the same as point 3/ point 1)

avg_by_year = num_stations_per_year.values[:,1]/unique_cities_per_year.values
avg_by_year_df = pd.DataFrame([num_stations_per_year.values[:,0], avg_by_year]).T
avg_by_year_df.columns = ['year', 'avg']
avg_by_year_df['year'] = avg_by_year_df['year'].astype('int')
avg_by_year_df.to_csv(os.getcwd() + '/data/Results/avg_numstations_by_year.csv')
avg_by_year_df.plot(x='year',
                    kind='bar',
                    figsize=(15,10))

plt.xticks(fontweight='bold', rotation=0, fontsize=15)
plt.yticks(fontweight='bold', fontsize=15)
plt.xlabel('Year', fontweight='bold', fontsize=20)
plt.ylabel('Average number of Stations', fontweight='bold', fontsize=20)
plt.title('Average number of Monitoring Stations', fontsize=25, fontweight='bold')
plt.tight_layout()
plt.legend().remove()
plt.savefig(os.getcwd() + '/plots/Results/avg_numstations_by_year.png')
plt.close()

# 5a. Average number of monitoring stations per city by year
avg_by_city_year_df = df.groupby(['City', 'year'])['No. Stations'].mean().reset_index()
avg_by_city_year_df.to_csv(os.getcwd() + '/data/Results/avg_by_city_year_df.csv', index=False)

# 6. Average number of monitoring stations per city by month (I am assuming this is the same as point 4/point 2)
avg_by_month = num_stations_per_month.values[:,2]/unique_cities_per_month.values[:,2]
avg_by_month_df = pd.DataFrame(unique_cities_per_month.values[:,0:2])
avg_by_month_df['avg'] = avg_by_month
avg_by_month_df.columns = ['year', 'month', 'avg']
avg_by_year_df.to_csv(os.getcwd() + '/data/Results/avg_numstations_by_month.csv')

avg_by_month_df['date'] = avg_by_month_df['year'].astype(str) + '-' + avg_by_month_df['month'].astype(str)

avg_by_month_df.plot(x='date', y='avg',
                            kind='bar',
                            figsize=(15,10))
selected_ticks = [0] + list(range(12, avg_by_month_df['date'].shape[0], 12))  # First, 13th, 26th, etc.
plt.xticks(selected_ticks, fontweight='bold', rotation=0, fontsize=15)
plt.yticks(fontweight='bold', fontsize=15)
plt.xlabel('Month', fontweight='bold', fontsize=20)
plt.ylabel('Average number of Stations', fontweight='bold', fontsize=20)
plt.title('Average number of  Monitoring Stations', fontsize=25, fontweight='bold')
plt.tight_layout()
# Remove legend box
plt.legend().remove()
plt.savefig(os.getcwd() + '/plots/Results/avg_numstations_by_month.png')
plt.close()

# 7. Number of cities with 1,2,3,4,5-10,10-20,20+ stations by year (a table) 
df_1 = df.drop_duplicates(subset=['City','year'], keep='last')
df_1['#stations/city'] = pd.cut(df_1['No. Stations'], [0, 1, 2, 3, 4, 10, 20, 50], labels=['1s', '2s', '3s', '4s',
                                                                                          '5-10s', '10-20s', '20s+'])
city_type_yearly_counts = df_1.groupby(['year','#stations/city'])['City'].nunique()
city_type_yearly_counts = city_type_yearly_counts.reset_index()

city_type_yearly_counts = city_type_yearly_counts.pivot_table(columns='#stations/city', index='year', values='City').reset_index()

city_type_yearly_counts.to_csv(os.getcwd() + '/data/Results/city_type_yearly_counts.csv', index=False)

# 8. Number of cities with 1,2,3,4,5-10,10-20,20+ stations by month (a table)
df_1 = df.drop_duplicates(subset=['City','year','month'], keep='last')
df_1['#stations/city'] = pd.cut(df_1['No. Stations'], [0, 1, 2, 3, 4, 10, 20, 50], labels=['1s', '2s', '3s', '4s',
                                                                                          '5-10s', '10-20s', '20s+'])
city_type_monthly_counts = df_1.groupby(['year','month', '#stations/city'])['City'].nunique()
city_type_monthly_counts = city_type_monthly_counts.reset_index()
#city_type_monthly_counts['date'] = city_type_monthly_counts['year'].astype(str) + '-' + city_type_monthly_counts['month'].astype(str)

city_type_monthly_counts = city_type_monthly_counts.pivot_table(columns='#stations/city', index=['year','month'], values='City').reset_index()
city_type_monthly_counts.to_csv(os.getcwd() + '/data/Results/city_type_monthly_counts.csv', index=False)
