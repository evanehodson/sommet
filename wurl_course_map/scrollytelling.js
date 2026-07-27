const SECTIONS = [
    {
        id: 1,
        title: "Ferguson Canyon to Twin Peaks",
        miles: "0.0–6.3",
        mileStart: 0.0,
        mileEnd: 6.3,
        description: "You start in forest, climbing fast through Ferguson Canyon before the trees give way to granite walls. By the time you break out above treeline, you've gained more than five thousand feet without a flat stretch to recover on. The quartzite ridge above Stairs Gulch is regarded as one of the range's better sunrise vantage points, given its east-facing aspect and elevation. This opening stretch carries the steepest sustained vert on the entire route.",
        photoUrl: "https://live.staticflickr.com/7564/16086963896_d2d426a23b.jpg",
        attribution: "Photo: Andrey Zharkikh / CC BY 2.0"
    },
    {
        id: 2,
        title: "Twin Peaks to Mount Superior",
        miles: "6.3–9.2",
        mileStart: 6.3,
        mileEnd: 9.2,
        description: "The trail disappears around Broad Fork Twin, replaced by a narrowing spine of rock with Snowbird visible far below. From here across Dromedary, Monte Cristo, and toward Superior, the route is sustained class 3–4 scrambling, hands on rock for most of the traverse. There is no maintained bailout once you're committed to this ridge, and no section of easier walking to break up the exposure.",
        photoUrl: "https://live.staticflickr.com/8492/8304971251_16fa414283.jpg",
        attribution: "Photo: Tristan Higbee / CC BY 2.0"
    },
    {
        id: 3,
        title: "Superior to Honeycomb Cliffs",
        miles: "9.2–13.2",
        mileStart: 9.2,
        mileEnd: 13.2,
        description: "Cardiff Pass marks a brief drop in grade, and Flagstaff and Davenport Hill are runnable in a way little before them has been. Then the route climbs onto the Honeycomb Cliffs, banded rock walls rising above Alta with a layered, almost architectural look from a distance. The exposed traverses along the cliff band are technically less severe than Superior's ridge, but they arrive after roughly ten miles and 9,000 feet of climbing already logged.",
        photoUrl: "https://live.staticflickr.com/1019/820335874_19c633e50c.jpg",
        attribution: "Photo: summitcheese / CC BY-SA 2.0"
    },
    {
        id: 4,
        title: "Honeycomb Cliffs to Devil's Castle",
        miles: "13.2–17.0",
        mileStart: 13.2,
        mileEnd: 17.0,
        description: "Past Catherine's Pass, the route drops through Alta's ski runs before climbing back onto exposed rock at Devil's Castle, a jagged, castellated summit block visible from miles away. The crossing is a knife-edge traverse with significant fall exposure on both sides, and it is the section most frequently cited in trip reports as the technical highlight of the route, independent of length.",
        photoUrl: "https://live.staticflickr.com/2642/3828064916_9c75df0970.jpg",
        attribution: "Photo: summitcheese / CC BY-SA 2.0"
    },
    {
        id: 5,
        title: "Devil's Castle to Hidden Peak",
        miles: "17.0–19.4",
        mileStart: 17.0,
        mileEnd: 19.4,
        description: "Sugarloaf and Baldy lead to Snowbird's Hidden Peak, where the tram terminal sits at just under 11,000 feet. This is the only reliable resupply point on the route, food and water accessible without carrying it in. Past this point, the terrain grows more remote and the route no longer crosses any maintained infrastructure until the finish.",
        photoUrl: "https://live.staticflickr.com/3452/3954320605_5e00e323df.jpg",
        attribution: "Photo: John Morgan / CC BY 2.0"
    },
    {
        id: 6,
        title: "Hidden Peak to the Pfeifferhorn",
        miles: "19.4–24.7",
        mileStart: 19.4,
        mileEnd: 24.7,
        description: "The American Fork Twins lead into the stretch most frequently cited as the technical crux of the route: Red Stack, Red Baldy, and White Baldy, connected by loose rock and sustained class 3–4 climbing. The Pfeifferhorn follows, a sharp, distinctive summit prominent enough that it draws climbers as a standalone objective independent of the WURL. On this route, it marks roughly two-thirds of the distance and elevation gain.",
        photoUrl: "https://live.staticflickr.com/1334/696686505_c7b7c09d8c.jpg",
        attribution: "Photo: summitcheese / CC BY-SA 2.0"
    },
    {
        id: 7,
        title: "Pfeifferhorn to Lone Peak",
        miles: "24.7–29.1",
        mileStart: 24.7,
        mileEnd: 29.1,
        description: "UPWOP, South Thunder, and Bighorn Peak occupy the most remote stretch of the route, well removed from any trailhead. Most parties cross this section at night, given typical start times and cumulative pace, navigating undulating, unmarked terrain by headlamp. Trip reports consistently identify this as the section with the highest rate of route-finding delays.",
        photoUrl: "https://live.staticflickr.com/65535/52270931818_e1daf74b74.jpg",
        attribution: "Photo: DanL2011 / CC BY-SA 2.0"
    },
    {
        id: 8,
        title: "Lone Peak to Bells Canyon",
        miles: "29.1–35.6",
        mileStart: 29.1,
        mileEnd: 35.6,
        description: "The summit of Lone Peak offers a view back across the full horseshoe, including the Question Mark Wall in the cirque below. The descent leaves the summit ridge and drops through a steep, loose gully into Bells Canyon, terrain that has been the site of serious falls, including at least one fatality. Below the gully, the route joins the maintained Bells Canyon trail for the final miles to the trailhead.",
        photoUrl: "https://live.staticflickr.com/2348/2529743908_811dbb59e2.jpg",
        attribution: "Photo: Zach Taylor / CC BY 2.0"
    }
];

export const SECTION_BOUNDARY_MILES = [0.0, 6.3, 9.2, 13.2, 17.0, 19.4, 24.7, 29.1, 35.6];

export function initScrollytelling({ onMileChange, onSidebarToggle }) {
    const sidebar = document.getElementById('scrollytelling-sidebar');
    const scrollContainer = document.getElementById('sidebar-scroll-container');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const closeBtn = document.getElementById('sidebar-close');

    let isOpen = false;
    let isProgrammaticScroll = false;
    let activeSectionIdx = -1;
    let currentMile = 0;
    let cardHeight = 500;

    function isMobile() {
        return window.innerWidth <= 768;
    }

    function measureCardHeight() {
        const firstCard = scrollContainer.querySelector('.section-card');
        if (firstCard) {
            const h = firstCard.getBoundingClientRect().height;
            if (h > 0) cardHeight = h;
        }
    }

    function buildCards() {
        scrollContainer.innerHTML = '';

        SECTIONS.forEach((sec, i) => {
            const card = document.createElement('div');
            card.className = 'section-card';
            card.dataset.index = i;
            card.innerHTML =
                '<img class="section-photo" src="' + sec.photoUrl + '" alt="' + sec.title + '" loading="lazy">' +
                '<div class="section-card-body">' +
                    '<div class="section-header-row">' +
                        '<div class="section-number">Section ' + sec.id + '</div>' +
                        '<div class="section-miles">' + sec.miles + ' mi</div>' +
                    '</div>' +
                    '<h3 class="section-title">' + sec.title + '</h3>' +
                    '<p class="section-description">' + sec.description + '</p>' +
                    (sec.attribution ? '<div class="section-attribution">' + sec.attribution + '</div>' : '') +
                '</div>';
            scrollContainer.appendChild(card);
        });

        if (!isMobile()) {
            const cards = scrollContainer.querySelectorAll('.section-card');
            cards.forEach(function(c) {
                c.style.height = cardHeight + 'px';
                c.style.overflow = 'hidden';
            });
        }

        var spacer = document.createElement('div');
        spacer.style.height = cardHeight + 'px';
        spacer.className = 'scroll-spacer';
        scrollContainer.appendChild(spacer);
    }

    buildCards();

    setTimeout(measureCardHeight, 100);

    function scrollPosToMile(scrollTop) {
        var cardIdx = Math.floor(scrollTop / cardHeight);
        if (cardIdx >= SECTIONS.length) cardIdx = SECTIONS.length - 1;
        if (cardIdx < 0) cardIdx = 0;

        var withinCard = scrollTop - cardIdx * cardHeight;
        var fraction = Math.max(0, Math.min(1, withinCard / cardHeight));
        var sec = SECTIONS[cardIdx];
        return sec.mileStart + fraction * (sec.mileEnd - sec.mileStart);
    }

    function mileToScrollTop(mile) {
        var cardIdx = 0;
        for (var i = 0; i < SECTIONS.length; i++) {
            if (mile < SECTIONS[i].mileEnd || i === SECTIONS.length - 1) {
                cardIdx = i;
                break;
            }
        }
        var sec = SECTIONS[cardIdx];
        var fraction = (mile - sec.mileStart) / (sec.mileEnd - sec.mileStart);
        fraction = Math.max(0, Math.min(1, fraction));
        return cardIdx * cardHeight + fraction * cardHeight;
    }

    function updateActiveSection(idx) {
        if (idx !== activeSectionIdx) {
            activeSectionIdx = idx;
            const cards = scrollContainer.querySelectorAll('.section-card');
            cards.forEach(function(c, i) { c.classList.toggle('active', i === activeSectionIdx); });
        }
    }

    scrollContainer.addEventListener('scroll', function() {
        if (isProgrammaticScroll) return;

        var scrollTop = scrollContainer.scrollTop;
        var scrollMax = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        if (scrollMax <= 0) return;

        currentMile = scrollPosToMile(scrollTop);
        var cardIdx = Math.min(Math.floor(scrollTop / cardHeight), SECTIONS.length - 1);

        updateActiveSection(cardIdx);
        if (onMileChange) onMileChange(currentMile);
    });

    function open() {
        isOpen = true;
        sidebar.classList.add('open');
        toggleBtn.classList.add('hidden');
        if (onSidebarToggle) onSidebarToggle(true);
        updateActiveSection(activeSectionIdx >= 0 ? activeSectionIdx : 0);
        setTimeout(measureCardHeight, 50);
    }

    function close() {
        isOpen = false;
        sidebar.classList.remove('open');
        toggleBtn.classList.remove('hidden');
        if (onSidebarToggle) onSidebarToggle(false);
    }

    toggleBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);

    window.addEventListener('resize', function() {
        measureCardHeight();
        if (isOpen) {
            var targetTop = mileToScrollTop(currentMile);
            isProgrammaticScroll = true;
            scrollContainer.scrollTop = targetTop;
            setTimeout(function() { isProgrammaticScroll = false; }, 50);
        }
    });

    function jumpToMile(mile) {
        currentMile = mile;
        if (!isOpen) return;

        var targetTop = mileToScrollTop(mile);
        var cardIdx = Math.min(Math.floor(targetTop / cardHeight), SECTIONS.length - 1);

        isProgrammaticScroll = true;
        scrollContainer.scrollTop = targetTop;
        setTimeout(function() { isProgrammaticScroll = false; }, 100);

        updateActiveSection(cardIdx);
    }

    return {
        jumpToMile: jumpToMile,
        isSidebarOpen: function() { return isOpen; },
        open: open,
        close: close
    };
}
