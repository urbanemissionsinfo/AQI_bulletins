export function drawChoropleth2(svg) {
  d3.json("data/INDIA_STATES_simplify.geojson").then(geoData => {
    // Set up color scale
    const color = d3.scaleSequential()
      .domain([0, d3.max(geoData.features, d => +d.properties.num_manual)])
      .interpolator(d3.interpolateBlues);

    // Set up projection and path generator
    const bounds = svg.node().getBoundingClientRect();
    const viewBox = svg.attr("viewBox").split(" ").map(Number);

    const width = viewBox[2];
    const height = viewBox[3];
    const projection = d3.geoMercator()
      .center([82.8, 22]) // center of India
      .scale(width*1.5)
      .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);

    // Draw states
    svg.selectAll("path")
      .data(geoData.features)
      .join("path")
      .attr("d", path)
      .transition().duration(1000)
      .attr("fill", d => {
        const count = d.properties.num_manual;
        return count != null ? color(count) : "#eee";
      })
      .attr("stroke", "#999")
      .style("opacity", 1);

    // Add labels for number of monitors
    function getBrightness(colorHex) {
        const rgb = d3.color(colorHex);
        // Perceived brightness formula
        return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
        }

    svg.selectAll("text.state-label")
        .data(geoData.features)
        .join("text")
        .attr("class", "state-label")
        .attr("x", d => path.centroid(d)[0])
        .attr("y", d => path.centroid(d)[1])
        .text(d => d.properties.num_manual)
        .attr("text-anchor", "middle")
        .attr("font-size", "1rem")
        .attr("font-weight", "bold")
        .attr("fill", d => {
            const fillColor = color(d.properties.num_manual || 0);
            return getBrightness(fillColor) < 128 ? "white" : "black";
        })
        .attr("pointer-events", "none")
        .attr("stroke", d => {
            const fillColor = color(d.properties.num_manual || 0);
            return getBrightness(fillColor) < 128 ? "black" : "white"; // optional outline
        })
        .attr("stroke-width", 0.5)
        .attr("paint-order", "stroke")
        .style("opacity", 0)
        .transition().duration(500)
        .style("opacity", 1);


    // Add tooltip on hover (optional)
    const tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("background", "#fff")
      .style("padding", "5px 10px")
      .style("border", "1px solid #ccc")
      .style("pointer-events", "none")
      .style("opacity", 0);

    svg.selectAll("path")
      .on("mouseover", (event, d) => {
        tooltip.transition().duration(200).style("opacity", 1);
        tooltip.html(
          `<strong>${d.properties.stname}</strong><br/>
           Monitors: ${d.properties.num_manual}`
        )
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", () => {
        tooltip.transition().duration(300).style("opacity", 0);
      });

  });
}

export function collapseChoropleth(svg) {
    svg.selectAll("path")
      .transition()
      .duration(500)
      .attr("transform", "scale(0.1) translate(0, 0)")
      .style("opacity", 0)
      .remove();

    svg.selectAll("text.state-label")
      .transition()
      .duration(100)
      .style("opacity", 0)
      .remove();
}