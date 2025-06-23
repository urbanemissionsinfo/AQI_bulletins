import { drawChoropleth1 } from './vis1_choropleth.js';
import { drawChoropleth2, collapseChoropleth } from './vis2_choropleth.js';
import { drawBars, collapsebars } from './vis3_bars.js';
import { drawStackedBars, collapsestackedbars } from './vis4_stackedbars.js';
''
function clearVisuals() {
      // Also remove any tooltips (if appended to body)
      d3.selectAll(".tooltip").remove();
    }

function color_textbg(index) {
    const text_element = d3.select('#step' + index).select('p');
    text_element
        .style('border-left', '4px solid steelblue')
        .style('background-color', '#e0f0ff')
        .style('opacity',1);
}

function remove_color_textbg(index) {
    const text_element = d3.select('#step' + index).select('p');
    text_element
        .style('border-left', '0px solid steelblue')
        .style('background-color', 'white')
        .style('opacity',0.3);
}

const callbacks = [drawChoropleth1, drawChoropleth2, drawBars, drawStackedBars]
// instantiate the scrollama
const scroller = scrollama();
scroller.setup({
  step: ".step",
  threshold: 0.25
})
const svg = d3.select('#chart');
// setup the instance, pass callback functions
scroller
  .setup({
    step: ".step",
  })
  .onStepEnter((response) => {
    clearVisuals();
    
    color_textbg(response.index);
    if (response.index == 2) {
      collapseChoropleth(svg);
    }

    callbacks[response.index](svg);
    // { element, index, direction }
  })
  .onStepExit((response) => {
    remove_color_textbg(response.index);
    if (response.index == 2 && response.direction == "up") {
      collapsebars(svg);
    }
    if (response.index == 3 && response.direction == "up") {
      collapsestackedbars(svg);
    }
    // { element, index, direction }
  });
