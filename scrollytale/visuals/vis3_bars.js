export function drawBars(svg) {

  const data = [
    { year: 2015, value: 22 },
    { year: 2016, value: 33 },
    { year: 2017, value: 54 },
    { year: 2018, value: 75 },
    { year: 2019, value: 115 },
    { year: 2020, value: 135 },
    { year: 2021, value: 170 },
    { year: 2022, value: 209 },
    { year: 2023, value: 271 }
  ];

  d3.csv("data/unique_cities_per_year.csv", d => ({
    year: +d.year,
    value: +d.City
  })).then(rawData => {
    const data = rawData.slice(0, -1); // Exclude the last row

    const viewBox = svg.attr("viewBox").split(" ").map(Number);

    const width = viewBox[2];
    const height = viewBox[3];
    const margin = { top: 20, right: 10, bottom: 50, left: 60 };

        // Add tooltip on hover (optional)
    const tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("background", "#fff")
      .style("padding", "5px 10px")
      .style("border", "1px solid #ccc")
      .style("pointer-events", "none")
      .style("opacity", 0);


    const x = d3.scaleBand()
      .domain(data.map(d => d.year))
      .range([margin.left, width - margin.right])
      .padding(0.1);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value)]).nice()
      .range([height - margin.bottom, margin.top]);


    // Bars
    svg.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", d => x(d.year))
      .attr("width", x.bandwidth())
      .attr("y", height - margin.bottom)
      .attr("height", 0)
      .attr("fill", "#08306B")
      .on("mouseover", function (event, d) {
          tooltip
          .style("opacity", 1)
          .html(`
              ${d.value} Cities
              
          `);
          d3.select(this).attr("stroke", "#000").attr("stroke-width", 1.5);
      })
      .on("mousemove", function (event) {
          tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 28 + "px");
      })
      .on("mouseout", function () {
          tooltip.style("opacity", 0);
          d3.select(this).attr("stroke", null);
      })
      .transition()
      .delay((d, i) => i*50)
      .duration(750)
      .ease(d3.easeSin)
      .attr("y", d => y(d.value))
      .attr("height", d => y(0) - y(d.value));

    // X axis
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")))
      .selectAll("text")
      .style("font-size", "0.9rem");

    // Y axis
    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y))
      .selectAll("text")
      .style("font-size", "0.9rem");

    // Axis labels (optional)
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height - 10)
      .attr("text-anchor", "middle")
      .text("Year")
      .style("font-size", "1rem");

    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", 15)
      .attr("text-anchor", "middle")
      .text("Number of Cities")
      .style("font-size", "1rem");

    // Add value labels on top of bars
  svg.selectAll("text.bar-label")
    .data(data)
    .join("text")
    .attr("class", "bar-label")
    .text(d => d.value)
    .attr("x", d => x(d.year) + x.bandwidth() / 2)
    .attr("y", d => y(d.value) +15) //  above the bar
    .attr("text-anchor", "middle")
    .style("font-size", "0.85rem")
    .attr("fill", "white")
    .style('opacity',0)
    .transition()
    .duration(1000)
    .style('opacity',1)
    
    .style("pointer-events", "none"); // prevent labels from blocking mouse interaction

  const startX = x(data[0].year) + x.bandwidth() / 2;
  const startY = y(data[0].value);
  const endX = x(data[data.length - 1].year) + x.bandwidth() / 2;
  const endY = y(data[data.length - 1].value);

  // Choose a small vertical offset to create a subtle arc
  const arcHeight = 40;

  // Midpoint
  const midX = (startX + endX) / 2;
  const midY = Math.min(startY, endY) - arcHeight;

  // Use a quadratic Bézier curve: M → Q → end
  const arcPath = `
    M ${startX} ${startY-20}
    Q ${midX} ${midY*140}, ${endX-50} ${endY-20}
  `;
  })
}

export function collapsebars(svg) {
    svg.selectAll("rect")
      .transition()
      .duration(500)
      .attr("transform", "scale(0.1) translate(0, 0)")
      .style("opacity", 0)
      .attr("height", 0)
      .remove();

    svg.selectAll("g")
      .transition()
      .duration(100)
      .style("opacity", 0)
      .remove();

    svg.selectAll("text")
      .transition()
      .duration(100)
      .style("opacity", 0)
      .remove();
}