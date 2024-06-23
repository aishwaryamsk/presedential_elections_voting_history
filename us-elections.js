
let dataset;
let votingData = {};
let stateAbbr = {};
let heatMapData = [];
let images;
let curYear = 2020; // default year
let curState;

let votesScale = d3.scaleLinear().range([0, 300]);

var path = d3.geoPath();
let usStatesData = 'https://d3js.org/us-10m.v2.json';

const colorScales = { // normalized: max candidate votes / total votes in states
    'DEMOCRAT': d3.scaleLinear().range(['#a1d6f7', '#026fbd']),
    'REPUBLICAN': d3.scaleLinear().range(['#f7a1a1', '#bd0202'])
}

const barColorScale = {
    'DEMOCRAT': '#2c98e6',
    'REPUBLICAN': '#d95b5b',
    'LIBERTARIAN': 'black',
    'OTHER': 'black'
}

let minPartyVotePercent, maxPartyVotePercent;

let candidateWins; // all wins of a candidate

let tooltip = d3.select('#tooltip')
    .attr('class', 'tooltip');

loadData();
function loadData() {
    Promise.all([
        d3.json(usStatesData),
        d3.csv('1976-2020-president.csv')
    ]).then(function (data) {
        dataset = data[1];
        preprocessData(data[1]);
        plotWinHistory();
        plotMap(data[0]);

        // update candidiate info
        updateCandidateInfo(curYear);

        // highlight 2020 by default
        d3.select(`#yr_${curYear}`).classed('heavy-font', true);
    });

}

function preprocessData(data) {
    data.forEach(row => {
        if (row.state !== 'DISTRICT OF COLUMBIA') {

            if (!votingData[row.year]) {
                votingData[row.year] = {};
            }
            if (!votingData[row.year][row.state]) {
                votingData[row.year][row.state] = {};
            }
            if (!votingData[row.year][row.state]['totalVotes']) {
                votingData[row.year][row.state]['totalVotes'] = +row.totalvotes;
            }
            if (!votingData[row.year][row.state]['candInfo']) {
                votingData[row.year][row.state]['candInfo'] = [];
            }
            let entry = {};
            let names = row.candidate.split(', ');
            entry['candidate'] = `${names[1]} ${names[0]}`;
            entry['votes'] = +row.candidatevotes;
            entry['totalvotes'] = +row.totalvotes;
            entry['partyDetailed'] = row['party_detailed'];
            entry['partySimplified'] = row['party_simplified'];
            votingData[row.year][row.state]['candInfo'].push(entry);

            if (!stateAbbr[row.state])
                stateAbbr[row.state] = row.state_po;

            // get heatmap data
            if (heatMapData.length === 0 || (heatMapData.at(-1)['state'] != row.state || heatMapData.at(-1)['year'] != row.year)) {
                let hmEntry = {};
                hmEntry['votes'] = +row.candidatevotes;
                hmEntry['totalvotes'] = +row.totalvotes;
                hmEntry['partyDetailed'] = row['party_detailed'];
                hmEntry['partySimplified'] = row['party_simplified'];
                hmEntry['year'] = row.year;
                hmEntry['state'] = row.state;
                heatMapData.push(hmEntry);
            } else {
                // if it exists, store the highest value of votes
                if (heatMapData.at(-1)['votes'] < +row.candidatevotes) {
                    // update entry
                    heatMapData.at(-1)['votes'] = +row.candidatevotes;
                    heatMapData.at(-1)['totalvotes'] = +row.totalvotes;
                    heatMapData.at(-1)['partyDetailed'] = row['party_detailed'];
                    heatMapData.at(-1)['partySimplified'] = row['party_simplified'];
                    heatMapData.at(-1)['year'] = row.year;
                    heatMapData.at(-1)['state'] = row.state;
                }
            }
        }
    });

    // strongest party win of all time
    let maxCandidateVote = Number.NEGATIVE_INFINITY;
    Object.keys(votingData).forEach(function (yr) {
        let partyVotes = {};
        Object.keys(votingData[yr]).forEach(function (s) { // for all states
            // find candidate with most votes
            let partyData = getMaxVoteCandidate(votingData[yr][s].candInfo);
            // find candidate and max votes received in all states?
            if (!Object.keys(partyVotes).includes(partyData.partySimplified))
                partyVotes[partyData.partySimplified] = partyData.votes;
            else partyVotes[partyData.partySimplified] += partyData.votes;
        });
        let v = d3.max(Object.keys(partyVotes), function (p) {
            return partyVotes[p];
        });
        maxCandidateVote = Math.max(maxCandidateVote, v);
    });
    votesScale.domain([0, maxCandidateVote]);


    /* // strongest party win of all time for any state
    let maxPartyVote = Number.NEGATIVE_INFINITY;
    let minPartyVote = Number.POSITIVE_INFINITY;
    Object.keys(votingData).forEach(function (yr) {
        Object.keys(votingData[yr]).forEach(function (s) { // for all states
            // find candidate with most votes
            let partyData = getMaxVoteCandidate(votingData[yr][s].candInfo);
            maxPartyVote = Math.max(maxPartyVote, partyData.votes);
            // only check for these two parties, otherwise the value will go very low
            if (['DEMOCRAT', 'REPUBLICAN'].includes(partyData.partySimplified))
                minPartyVote = Math.min(minPartyVote, partyData.votes);
        });
    }); */

    // min & max percent of party wins of all time for any state
    maxPartyVotePercent = Number.NEGATIVE_INFINITY;
    minPartyVotePercent = Number.POSITIVE_INFINITY;
    Object.keys(votingData).forEach(function (yr) {
        Object.keys(votingData[yr]).forEach(function (s) { // for all states
            // find candidate with most votes
            let partyData = getMaxVoteCandidate(votingData[yr][s].candInfo);
            maxPartyVotePercent = Math.max(maxPartyVotePercent, partyData.votes / partyData.totalvotes);
            // only check for these two parties, otherwise the value will go very low
            if (['DEMOCRAT', 'REPUBLICAN'].includes(partyData.partySimplified))
                minPartyVotePercent = Math.min(minPartyVotePercent, partyData.votes / partyData.totalvotes);
        });
    });

    // set domain as max candidate vote
    for (let scale in colorScales) {
        //colorScales[scale].domain([minPartyVote, maxPartyVote]);
        colorScales[scale].domain([minPartyVotePercent, maxPartyVotePercent]);
    }
}

function getMaxVoteCandidate(candInfo) {
    let maxVotes = Number.NEGATIVE_INFINITY;
    let partyDetailed;
    let partySimplified;
    let candidate;
    let totalvotes;
    Object.keys(candInfo).forEach(function (c) {
        if (candInfo[c].votes > maxVotes) {
            maxVotes = candInfo[c].votes;
            totalvotes = candInfo[c].totalvotes;
            partyDetailed = candInfo[c].partyDetailed;
            partySimplified = candInfo[c].partySimplified;
            candidate = candInfo[c].candidate;
        }
    });
    return { candidate: candidate, partyDetailed: partyDetailed, partySimplified: partySimplified, votes: maxVotes, totalvotes: totalvotes };
}

function plotMap(us) {
    let titleHt = document.getElementById('title').offsetHeight;
    let availableHt = window.innerHeight - titleHt;

    d3.select('#candInfo').attr('height', availableHt * 0.39).attr('width', window.innerWidth / 2);

    const features = topojson.feature(us, us.objects.states).features;
    const margin = { top: 0, right: 10, bottom: 0, left: 10 },
        width = 480,
        //height = window.innerHeight;
        height = (availableHt * 0.61) - margin.top - margin.bottom;

    const mapSVG = d3.select('#map')
        .attr('width', width)
        .attr('height', height);

    mapSVG.append('g')
        .attr('id', 'state-path')
        .selectAll('path')
        .data(features)
        .join('path')
        .attr('id', function (d) {
            // Remove DC - District of Columbia is not a state
            if (d.properties.name != 'District of Columbia') {
                return 'path_' + stateAbbr[d.properties.name.toUpperCase()];
            }
        })
        .attr('class', 'state pointer')
        .attr('transform', 'scale(0.5)')
        .attr('d', path)
        .attr('stroke', 'white')
        .attr('fill', d => {
            if (d.properties.name != 'District of Columbia') {
                let winner = getMaxVoteCandidate(votingData[curYear][d.properties.name.toUpperCase()].candInfo);
                return colorScales[winner.partySimplified](winner.votes / winner.totalvotes);
            }
        })
        .on('mousemove', function (e, d) {
            // highlight state
            let s = d.properties.name.toUpperCase();
            if (s !== curState) {
                d3.select(`#hm_${stateAbbr[s]}`).classed('heavy-font', true);
                d3.select(`#hm_${stateAbbr[curState]}`).classed('heavy-font', false);
                curState = s;

                setStateTextBold(s, true);
            }
            // tooltip
            tooltipMove(e, d.properties.name.toUpperCase(), curYear);
            document.getElementById('tooltip').style.display = 'block';
            tooltip.style('opacity', 1);
        })
        .on('mouseout', function (e, d) {
            let s = d.properties.name.toUpperCase();

            document.getElementById('tooltip').style.display = 'none';
            tooltip.style('opacity', 0);

            setStateTextBold(s, false);
        });

    // add state names
    mapSVG.append('g')
        .attr('id', 'state-names')
        .selectAll('text.states-name')
        .data(features)
        .enter()
        .append('text')
        .attr('id', function (d) {
            // Remove DC - District of Columbia is not a state
            if (d.properties.name != 'District of Columbia') {
                return 'text_' + stateAbbr[d.properties.name.toUpperCase()];
            }
        })
        .attr('class', 'states-name')
        .attr('transform', 'scale(0.5)')
        .text(function (d) {
            return stateAbbr[d.properties.name.toUpperCase()];
        })
        .attr('x', function (d) {
            return path.centroid(d)[0];
        })
        .attr('y', function (d) {
            return path.centroid(d)[1];
        })
        .attr('text-anchor', 'middle')
        .attr('fill', 'black');
}

function setStateTextBold(s, bold) {
    const el = d3.select(`#path_${stateAbbr[s]}`);

    if (bold) {
        el.raise().style('stroke', 'black');
    } else {
        el.style('stroke', 'white');
    }
    d3.select(`#text_${stateAbbr[s]}`).classed('heavy-font', bold);
}

// Update cholorpleth map for the year
function updateCholorplethMap(year) {
    let states = votingData[year];
    d3.selectAll('.state')
        .attr('fill', function (d) {
            let state = states[d.properties.name.toUpperCase()];
            if (state) {
                let winner = getMaxVoteCandidate(state.candInfo);
                return colorScales[winner.partySimplified](winner.votes / winner.totalvotes);
            }
        });
    d3.selectAll('.states-name').attr('fill', 'black');
}

function updateCandidateInfo(year) {
    if (year) {
        let states = votingData[year];
        let candidates = {};

        // store this for each year?
        Object.keys(states).forEach(function (s) {
            let cInfo = states[s].candInfo[0];
            let candidate = cInfo.candidate;
            if (!Object.keys(candidates).includes(candidate)) {
                candidates[candidate] = {};
                candidates[candidate].votes = cInfo.votes;
                candidates[candidate].party = cInfo.partySimplified;
            } else candidates[candidate].votes += cInfo.votes;
        });

        let c = Object.keys(candidates);
        c.sort((a, b) => candidates[b].votes - candidates[a].votes);

        d3.select('#candInfo .candidates')
            .attr('transform', 'translate(120, 30)')
            .selectAll('text')
            .data(c)
            .join('text')
            .text(d => d)
            .attr('text-anchor', 'end')
            .attr('transform', (d, i) => `translate(0, ${25 * i})`)
            .attr('font-size', '12px')
            .attr('class', 'pointer')
            .on('mouseover', function (e, d) {
                // highlight each state where the candidate won over all time
                candidateWins = getAllStatesCandidateWins(d);
                candidateWins.forEach(function (win) {
                    d3.select(`#hm${win.year}-${stateAbbr[win.state]}`).classed('win-highlight', true);
                });
            })
            .on('mouseout', function () {
                candidateWins.forEach(function (win) {
                    d3.select(`#hm${win.year}-${stateAbbr[win.state]}`).classed('win-highlight', false);
                });
            });

        d3.select('#candInfo .parties')
            .attr('transform', 'translate(120, 40)')
            .selectAll('text')
            .data(c)
            .join('text')
            .attr('class', 'parties-text')
            .text(d => `(${candidates[d].party})`)
            .attr('text-anchor', 'end')
            .attr('font-size', '9px')
            .attr('transform', (d, i) => `translate(0, ${25 * i})`);

        d3.select('#candInfo .logos')
            .attr('transform', 'translate(130, 15)')
            .selectAll('image')
            .data(c)
            .join('image')
            .attr('width', 20)
            .attr('height', 20)
            .attr('href', d => { if (['DEMOCRAT', 'REPUBLICAN', 'LIBERTARIAN'].includes(candidates[d].party)) return `imgs/${candidates[d].party}.png`; })
            .attr('transform', (d, i) => `translate(0, ${25 * i})`);

        d3.select('#candInfo .voteBars')
            .attr('transform', 'translate(170, 22)')
            .selectAll('rect')
            .data(c)
            .join('rect')
            .attr('x', 0)
            .attr('y', (d, i) => `${25 * i}`)
            .attr('height', 10)
            .attr('width', d => votesScale(candidates[d].votes))
            .attr('fill', d => barColorScale[candidates[d].party]);

        d3.select('#candInfo .voteCount')
            .attr('transform', 'translate(170, 30)')
            .selectAll('text')
            .data(c)
            .join('text')
            .attr('class', 'parties-text')
            .text(d => `(${candidates[d].votes.toLocaleString()})`)
            .attr('font-size', '9px')
            .attr('transform', (d, i) => `translate(${votesScale(candidates[d].votes) + 5}, ${25 * i})`)
    }
}

function getAllStatesCandidateWins(cand) { // store this for every party winner
    // get year, state
    let wins = [];
    Object.keys(votingData).forEach(function (yr) { // for every year
        Object.keys(votingData[yr]).forEach(function (s) { // for every state
            Object.keys(votingData[yr][s]).forEach(function (candInfo) { // from candidate info
                let winner = getMaxVoteCandidate(votingData[yr][s][candInfo]); // find winner
                if (winner.candidate == cand) {
                    wins.push({ year: yr, state: s });
                }
            });
        });
    });
    return wins;
}

function plotWinHistory() {
    let titleHt = document.getElementById('title').offsetHeight;

    let margin = { top: 30, right: 30, bottom: 20, left: 130 },
        width = (window.innerWidth / 2) - margin.left - margin.right,
        //width = 300,
        height = (window.innerHeight - titleHt) - margin.top - margin.bottom;

    const allWinsSVG = d3.select('#winHistory');
    const allWinsG = allWinsSVG
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add Y scales and axis:
    const y = d3.scaleBand()
        .range([0, height])
        .domain(Object.keys(stateAbbr))
        .padding(0.03);
    let yAxisLines = allWinsG.append('g')
        .call(d3.axisLeft(y));
    yAxisLines.select('path')
        .attr('stroke-opacity', 0); // hide the x-axis, show only the ticks (letter)
    yAxisLines.selectAll('line')
        .attr('stroke', 'grey');
    yAxisLines.selectAll('text')
        .attr('id', d => `hm_${stateAbbr[d]}`);

    // Add X scales and axis:
    const x = d3.scaleBand()
        .range([0, width])
        .domain(Object.keys(votingData))
        .padding(0.01);
    let xAxisLines = allWinsG.append('g')
        .call(d3.axisTop(x));
    xAxisLines.selectAll('text')
        .attr('id', d => `yr_${d}`);
    xAxisLines.select('path')
        .attr('stroke-opacity', 0);
    xAxisLines.selectAll('line')
        .attr('stroke', 'grey');

    // Fill rectangles
    allWinsG.selectAll('rect')
        .data(heatMapData)
        .join('rect')
        .attr('id', d => `hm${d.year}-${stateAbbr[d.state]}`)
        .attr('x', d => x(d.year))
        .attr('y', d => y(d.state))
        .attr('width', x.bandwidth())
        .attr('height', y.bandwidth())
        .style('fill', d => {
            if (Object.keys(colorScales).includes(d.partySimplified))
                return colorScales[d.partySimplified](d.votes / d.totalvotes);
            return '#CECECE';
        })
        .style('cursor', 'pointer')
        .on('mouseover', function (e, d) {
            let year = d.year;
            if (year !== curYear) {
                // update map
                updateCholorplethMap(year);
                // style year
                d3.select(`#yr_${year}`).classed('heavy-font', true);
                d3.select(`#yr_${curYear}`).classed('heavy-font', false);
                updateCandidateInfo(year);
                curYear = year;
            }
            if (d.state !== curState) {
                d3.select(`#hm_${stateAbbr[d.state]}`).classed('heavy-font', true);
                d3.select(`#hm_${stateAbbr[curState]}`).classed('heavy-font', false);
                curState = d.state;
            }
        })
        .on('mousemove', function (e, d) {
            tooltipMove(e, d.state, d.year);
            document.getElementById('tooltip').style.display = 'block';
            tooltip.style('opacity', 1);
            setStateTextBold(d.state, true);
        })
        .on('mouseout', function (e, d) {
            document.getElementById('tooltip').style.display = 'none';
            tooltip.style('opacity', 0);
            setStateTextBold(d.state, false);
        });

    /* var colorValues1 = [{ color: '#C4CAFF', value: minPartyVotePercent }, { color: '#7381FF', value: maxPartyVotePercent }];
    addRectangleLegend('#winlegend1', colorValues1, 200, margin.top + height + margin.bottom * 0.25);

    var colorValues2 = [{ color: '#FFD0D0', value: minPartyVotePercent }, { color: '#FF7A7A', value: maxPartyVotePercent }];
    addRectangleLegend('#winlegend2', colorValues2, 400, margin.top + height + margin.bottom * 0.25); */
}

function getTooltipTxt(state, year) {
    let c = getMaxVoteCandidate(votingData[year][state].candInfo);
    return msg = `Year: ${year} <br> \
               State: ${titleCase(state)} <br> \
               Candidate: ${titleCase(c.candidate)}  <br> \
               Party: ${titleCase(c.partySimplified)}  <br> \
               Candidate votes: ${c.votes.toLocaleString()} <br> \
               Total votes: ${c.totalvotes.toLocaleString()}`;
}

function tooltipMove(e, state, year) {
    tooltip.html(getTooltipTxt(state, year));

    let rect = tooltip.node().getBoundingClientRect();
    let w = rect.width + 10;
    let h = rect.height + 10;

    let x = e.clientX + 30;
    let y = e.clientY + 30;

    // Adjust tooltip when it goes out of right side
    if (x + w >= window.innerWidth)
        x = e.clientX - w - 30;
    // Adjust tooltip when it goes out of top
    if (y + h >= window.innerHeight)
        y = e.clientY - h - 30;

    tooltip.style('left', x + 'px')
        .style('top', y + 'px');
}

function titleCase(s) {
    return s.replace(
        /\w\S*/g,
        function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
}

function addRectangleLegend(id, data, x, y) {
    var legend = d3.select(id)
        .attr('transform', `translate(${x}, ${y})`);
    var extent = d3.extent(data, d => d.value);

    var padding = 9;
    var width = 140;
    var innerWidth = width - (padding * 2);
    var barHeight = 10;
    var xTicks = [0, extent[1] / 2, extent[1]];

    var xScale = d3.scaleLinear()
        .range([0, innerWidth])
        .domain(extent);

    var xAxis = d3.axisBottom(xScale)
        .tickSize(barHeight / 2)
        .tickValues(xTicks);

    var defs = d3.select('#winHistory').append('defs');
    var linearGradient = defs.append('linearGradient').attr('id', 'myGradient');
    linearGradient.selectAll('stop')
        .data(data)
        .enter().append('stop')
        .attr('offset', d => ((d.value - extent[0]) / (extent[1] - extent[0]) * 100) + '%')
        .attr('stop-color', d => d.color);

    legend.append('rect')
        .attr('width', innerWidth)
        .attr('height', barHeight)
        .style('fill', 'url(#myGradient)')
        .style('opacity', 0.7);

    legend.append('g')
        .attr('transform', `translate(0, ${barHeight})`)
        .call(xAxis)
        .select('.domain')
        .remove();
}