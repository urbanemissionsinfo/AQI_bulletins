export function drawStackedBars(svg) {
    svg.selectAll("text")
      .transition()
      .duration(100)
      .style("opacity", 0)
      .remove();

    // Clean up previous elements before drawing
    svg.selectAll("g.layer").interrupt().remove();
    svg.selectAll(".axis").interrupt().remove();
    svg.selectAll("text").interrupt().remove();
    svg.select("#legend").interrupt().remove();

  d3.csv("data/city_type_yearly_counts.csv", d3.autoType).then(rawData => {
    const data = rawData.slice(0, -1); // Remove the last row (2024)
    const categories = Object.keys(data[0]).filter(k => k !== "year");

    const viewBox = svg.attr("viewBox").split(" ").map(Number);
    const width = viewBox[2];
    const height = viewBox[3];
    const margin = { top: 20, right: 10, bottom: 50, left: 60 };

    const x = d3.scaleBand()
      .domain(data.map(d => d.year))
      .range([margin.left, width - margin.right])
      .padding(0.1);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d3.sum(categories, k => d[k]))]).nice()
      .range([height - margin.bottom, margin.top]);

    const color = d3.scaleOrdinal()
      .domain(categories)
      .range(d3.schemeCategory10);

    const stacked = d3.stack()
      .keys(categories)(data);

    // Add tooltip on hover (optional)
    const tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("background", "#fff")
      .style("padding", "5px 10px")
      .style("border", "1px solid #ccc")
      .style("pointer-events", "none")
      .style("opacity", 0);

    // Draw bars
    // Draw bars
svg.selectAll("g.layer")
    .data(stacked)
    .join("g")
    .attr("class", "layer")
    .selectAll("rect")
    .data(d => d.map(v => Object.assign(v, { key: d.key }))) // attach key for tooltip
    .join("rect")
    .attr("x", d => x(d.data.year))
    .attr("width", x.bandwidth())
    .on("mouseover", function (event, d) {
        tooltip
        .style("opacity", 1)
        .html(`
            ${d.data[d.key]} Cities with only ${d.key.split("s")[0]} Stations
            
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
    .attr("y", d => y(d[1]))
    .attr("height", d => y(d[0]) - y(d[1]))
    .attr("fill", "#08306B")   // initial state — dark blue
    .transition()
    .duration(1000)
    .attr("fill", d => color(d.key));

    // X Axis
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")))
      .selectAll("text")
      .style("font-size", "0.9rem");

    // Y Axis
    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y))
      .selectAll("text")
      .style("font-size", "0.9rem");

    // X Label
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height - 10)
      .attr("text-anchor", "middle")
      .text("Year")
      .style("font-size", "1rem");

    // Y Label
    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", 15)
      .attr("text-anchor", "middle")
      .text("Number of Cities")
      .style("font-size", "1rem");

    // Legend
    const legend = svg.append("g").attr("id", "legend")
      .attr("transform", `translate(${x(2015)}, ${margin.top})`);

    categories.forEach((key, i) => {
      const row = legend.append("g")
        .attr("transform", `translate(0, ${i * 20})`);

      row.append("rect")
        .attr("width", 12)
        .attr("height", 12)
        .attr("fill", color(key));

      row.append("text")
        .attr("x", 18)
        .attr("y", 10)
        .text(key)
        .style("font-size", "0.8rem");
    });
  });
}

export function collapsestackedbars(svg) {
    svg.selectAll("#legend")
      .transition()
      .duration(100)
      .style("opacity", 0)
      .remove();

}