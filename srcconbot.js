/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           ______     ______     ______   __  __     __     ______
          /\  == \   /\  __ \   /\__  _\ /\ \/ /    /\ \   /\__  _\
          \ \  __<   \ \ \/\ \  \/_/\ \/ \ \  _"-.  \ \ \  \/_/\ \/
           \ \_____\  \ \_____\    \ \_\  \ \_\ \_\  \ \_\    \ \_\
            \/_____/   \/_____/     \/_/   \/_/\/_/   \/_/     \/_/

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

var Botkit = require('botkit');

if(!process.env.CLIENTID) {
    require('./env.js')
}

var CLIENTID = process.env.CLIENTID,
    CLIENTSECRET = process.env.CLIENTSECRET,
    PORT = process.env.PORT;

if (!CLIENTID || !CLIENTSECRET || !PORT) {
    console.log('Error: Specify CLIENTID, CLIENTSECRET, and PORT in environment');
    process.exit(1);
}

if (process.env.REDISTOGO_URL) {
    var redisConfig = {
        'url': process.env.REDISTOGO_URL
    }
} else {
    var redisConfig = {};
}
var redisStorage = require('botkit-storage-redis')(redisConfig);


var controller = Botkit.slackbot({
    storage: redisStorage
    //json_file_store: './db_slackbutton_incomingwebhook/'
}).configureSlackApp({
    clientId: CLIENTID,
    clientSecret: CLIENTSECRET,
    scopes: ['incoming-webhook'],
});

var CronJob = require('cron').CronJob;
new CronJob('0 * * * * *', function() {
    checkTimeMatch();
}, null, true, 'America/Los_Angeles');

var moment = require('moment-timezone');
moment.tz.setDefault('America/Los_Angeles');

var checkTimeMatch = function() {
    var now = moment().startOf('minute'),
        match = transcripts[now.format('YYYY-MM-DD HH:mm')];

    if (match) {
        sendAlert(match);
    } else {
        console.log('Checked at '+now.format());
    }
}

var sendAlert = function(timeblock, message) {
    if (message) {
        postToSlack(message)
    } else {
        timeblock.forEach(function(transcript) {
            var attachments = [{
                'thumb_url': 'http://srccon.org/media/img/logo75.png',
                'pretext': ':speech_balloon::tada: A SRCCON 2016 session with live transcription is about to start!',
                'fallback': `A SRCCON 2016 session with live transcription is about to start: ${transcript.title}. Open the live transcript at http://srccon.aloft.nu/2016-${transcript.id}.`,
                'color': '#F79797',
                'title': transcript.title,
                'title_link': 'http://srccon.aloft.nu/2016-'+transcript.id,
                //'text': transcript.description,
                'fields': [
                    {
                        'title': 'Facilitator(s)',
                        'value': transcript.facilitators,
                    },
                    {
                        'title': 'Transcript',
                        'value': `<http://srccon.aloft.nu/2016-${transcript.id}|Open the live transcript>`,
                        'short': true
                    },
                    {
                        'title': 'Schedule',
                        'value': `<http://schedule.srccon.org/#_session-${transcript.id}|Open in SRCCON schedule>`,
                        'short': true
                    }
                ]
            }]
            postToSlack(false, attachments);
        });
    }
}

var postToSlack = function(text, attachments) {
    controller.storage.teams.all(function(err, teams) {
        var count = 0;
        for (var t in teams) {
            if (teams[t].incoming_webhook) {
                count++;
                controller.spawn(teams[t]).sendWebhook({
                    text: text,
                    attachments: attachments
                }, function(err) {
                if (err) {
                    console.log(err);
                }
            });
        }
    }
    console.log('Message sent to ' + count + ' teams!');
    });
}

controller.setupWebserver(PORT, function(err, webserver) {
    controller.createOauthEndpoints(controller.webserver, function(err, req, res) {
        if (err) {
            res.status(500).send('ERROR: ' + err);
        } else {
            //res.send('Success!');
            res.redirect('http://srccon.org/slackbot/success/');
        }
    });
});

controller.on('create_incoming_webhook', function(bot, webhook_config) {
    bot.sendWebhook({
        text: ':thumbsup: SRCCON Transcript Alerts are ready to roll! Each time a session with live transcription is about to begin, we\'ll post the title, description, and a link to the live transcript right here.'
    });
})

var key = d => moment.tz(d, "America/Los_Angeles").format("YYYY-MM-DD HH:mm");
var transcripts = {
    [key('2016-07-28 10:30')]: [
        {
            "day": "Thursday", 
            "description": "News apps teams are becoming more technically sophisticated: building tools, databases and custom CMS's. Our newsrooms are now (partially) responsible for product, but struggle to implement modern tech processes (user-centric design, agile development, automated testing). How do we balance the \"do it right\" attitude of product with the \"do it now\" needs of editorial? Who needs to be at the table for those kinds of decisions? We want to look at some effective lessons that can be shared across the different disciplines and discuss effective, productive ways to bridge the gap.", 
            "facilitators": "Julia Wolfe, Ivar Vong", 
            "id": "threat-modeling-code", 
            "length": "1 hour", 
            "room": "Innovation Studio", 
            "time": "10:30-11:30am", 
            "title": "Threat Modeling for Code: When is Bad Code the Better Solution?"
        },
        {
            "day": "Thursday", 
            "description": "The boons of publishing large, searchable databases are easy to grasp — with the right dataset, they can be major sources of traffic. It's easy to talk about the technical challenges of creating and maintaining these apps, and it's easy to argue for their existence in favor of openness — but what about the ethical challenges? There is much we've collectively learned over the course of nearly six years of maintaining the Texas Tribune's salary and prisoner databases. No matter how prepared you may be for the inevitable requests for exclusion, eventually there will be a request that causes you to pause and ask, \"wait, are we doing this right?\" What do you do when your established protocol is woefully inadequate for a person's request? When your news app puts you or your organization in the position of power, how do you ensure the humans in the data are treated with empathy? Our goal with this session is to encourage a dialog on and around these issues. We will go over our current policies, and share stories of what we've done well... and what we've done not so well. We'll work through different scenarios together, discuss and debate our responses and provide a space to discuss real life examples.", 
            "facilitators": "Ryan Murphy", 
            "id": "ethics-public-data", 
            "length": "1 hour", 
            "room": "Classroom 305", 
            "time": "10:30-11:30am", 
            "title": "You're The Reason My Name Is On Google: The Ethics Of Publishing Public Data"
        },
        {
            "day": "Thursday", 
            "description": "As a data science consultant, I use methods from statistics, machine learning, and design to solve problems. Communicating our findings effectively is to key to our success; it's important to both 1) faithfully and accurately present the data, the findings, and our recommendations, while 2) presenting all of that information in a quick, easily digestible way. Often, our end users don't have the time or technical expertise to comprehensively study our entire method, but neither do they ever want to blindly trust a \"black box\" method. So where is the in-between? I'll start the discussion by going through some of our experiences in communicating data science ideas both honestly and intuitively: from data visualization design choices, to experiential learning as a means for clients to understand complex ideas, to presentations with our end-to-end approach illustrated in simple analogies. Then I'd like to open up the floor, and learn from everybody else's experience. Time willing, I'd like to provide the opportunity for people to take a stab at presenting technical ideas of their own, and present them to the group in an intuitive way.", 
            "facilitators": "Bo Peng", 
            "id": "technical-ideas", 
            "length": "1 hour", 
            "room": "Boardroom", 
            "time": "10:30-11:30am", 
            "title": "How do we convey technical ideas without dumbing things down?"
        }
    ],
    [key('2016-07-28 12:00')]: [
        {
            "day": "Thursday", 
            "description": "At the end of 2014, Eric Meyer opened his Facebook feed to see an automated post marked \"your year in review,\" with a picture of his daughter--who had died that year from a brain tumor--surrounded by clip art of partygoers, confetti, and balloons. Nobody meant to cause Meyer harm, but thoughtlessness in the design of the feature (what he termed \"inadvertent algorithmic cruelty\") still left him shaken. And countless other examples abound. Of course, in the news industry, we're no strangers to accidental (and disastrous) juxtaposition: real estate ads placed next to stories on homelessness, bots that generate cringe-worthy content, and scheduled social media posts that go out during the worst kind of breaking news. In this session, we'll look at case studies of humane and inhumane design, practice identifying pitfalls in our news apps, and figure out how to care for our readers beyond just transmitting information.", 
            "facilitators": "Thomas Wilburn", 
            "id": "humane-news-apps", 
            "length": "1 hour", 
            "room": "Innovation Studio", 
            "time": "12-1pm", 
            "title": "Building news apps for humanity"
        },
        {
            "day": "Thursday", 
            "description": "Adblockers, malware, load times. How can we break the cycle of bad business and worse code sinking journalism? Advertising technology is unavoidably part of our sites and stories. Right now it slows our output; damages our relationship with readers; and is failing even to fund most of our efforts. Without collaboration to create better tools and processes we are failing. Newsrooms, sales floors and tech teams must come together to repair our relationship with users and advertisers or find ourselves without the resources to continue. The session would focus on starting the multi-team conversations we aren't having. How can we work together to earn and keep the trust and attention of our readers? How can our organizations collaborate to build better, more open, and more trustworthy alternatives to malware-infested inaccurate ad tech? What would that look like and what data could we comfortably provide advertisers so we can better manage expectations? What are the conversations we should be having, the tools we should be building, with our sales departments?", 
            "facilitators": "Aram Zucker-Scharff, Jarrod Dicker", 
            "id": "fixing-ad-tech", 
            "length": "1 hour", 
            "room": "Classroom 305", 
            "time": "12-1pm", 
            "title": "Skipping the blame game and working across teams to fix newsroom Ad Tech"
        },
        {
            "day": "Thursday", 
            "description": "How can we make sure that our data stories are being held to a high standard? It can be hard to fight the temptation to draw sweeping conclusions with bad data, but perhaps there are ways to put checks and balances in place to make sure that our analysis is accurate. Let's discuss peer review processes and things that have worked in newsrooms and methods that have proved ineffective. Is there a best-practices approach to holding ourselves accountable for the data stories we tell?", 
            "facilitators": "Ariana Giorgi, Christine Zhang", 
            "id": "peer-review-data-stories", 
            "length": "1 hour", 
            "room": "Boardroom", 
            "time": "12-1pm", 
            "title": "How can we peer review our data stories?"
        }
    ],
    [key('2016-07-28 14:30')]: [
        {
            "day": "Thursday", 
            "description": "Algorithms play an increasingly relevant role in shaping our digital and physical experiences of the world. It is frequently the case that data from our digital footprints is used to predict our behavior and make decisions about the choices available to us. This unprecedented capacity to collect and analyze data has brought along with it a troubling dismissiveness of user agency, participation, and ownership. Such systems assume that it is an acceptable by-product for their users to have no understanding of the decisions being made about them and no agency in that decision-making process. For the most part, the invisibilized nature of these decisions are seen as a feature, not a bug, of a good user experience. As we begin to use algorithmic decision-making in areas of our lives that are increasingly high-stakes, it is essential that we create and utilize processes that maintain user agency and understanding. In this session, participants will be imagining and designing user experiences that employ participatory algorithmic-decision making processes. The session will be open to folks from all experience levels. We would be excited to see folks from a variety of different backgrounds, including designers, data scientists, journalists, privacy & security practitioners, and organizers from marginalized and frequently surveilled communities.", 
            "facilitators": "Tara Adiseshan, Linda Sandvik", 
            "id": "participatory-algorithms", 
            "length": "1 hour", 
            "room": "Innovation Studio", 
            "time": "2:30-3:30pm", 
            "title": "Designing Participatory Algorithmic Decision-Making Processes"
        },
        {
            "day": "Thursday", 
            "description": "We talk a lot about documenting our work throughout projects, but we really don't talk enough about how we can use better documentation to start us off in our jobs with the right knowledge and technology stack of the newsroom. For example, when someone leaves the newsroom is there some type of minimum documentation that they have to do or is there no expectation set for this? What about all of the institutional knowledge that people take when they leave a newsroom? Should there be guidelines on what sources and information you leave behind so the next person doesn't have to spend a lot of time reinventing the wheel? Let's have a discussion about newsroom on-boarding and off-boarding processes and how we, as a news nerd community, can work through some simple ways together to make these processes more efficient and useful for the future.", 
            "facilitators": "Sandhya Kambhampati", 
            "id": "newsroom-onboarding", 
            "length": "1 hour", 
            "room": "Classroom 305", 
            "time": "2:30-3:30pm", 
            "title": "The good and bad of newsroom on-boarding processes (and how can we make them better)"
        },
        {
            "day": "Thursday", 
            "description": "The design and deployment of software has important implications for maintenance and operation in a newsroom. We'll discuss the attributes of software projects that have an impact on their sustainability & ease of use over time (who will run your code when you're gone?). We'll also play a little design game to map out which attributes take priority in our newsrooms, and how open source software projects in the news match up to those priorities.", 
            "facilitators": "Ted Han, Mike Tigas", 
            "id": "ecology-newsroom-software", 
            "length": "1 hour", 
            "room": "Classroom 310", 
            "time": "2:30-3:30pm", 
            "title": "The Ecology of Newsroom Software"
        }
    ],
    [key('2016-07-28 16:00')]: [
        {
            "day": "Thursday", 
            "description": "Who are you building for? What do they need? User research is something everyone on the team can be involved in, whether by asking a partner what they think or creating a quick usability test for others to try. Let's make a user research toolkit for everyone who's in a distributed dev team that works in news. How can we empower everyone on the team to run their own mini research projects, and then filter the results back into the product? Which listening/observation methods would help you with your work? We'll talk as a group about different methodologies, techniques, and organizational resistance that we've encountered. Together we'll aim to create a scrappy user research toolkit for all SRCCONers to take with them back to the office.", 
            "facilitators": "Emily Goligoski, Andrew Losowosky", 
            "id": "user-research-toolkit", 
            "length": "1 hour", 
            "room": "Innovation Studio", 
            "time": "4-5pm", 
            "title": "Hungry for audience insights? Let's make a DIY user research toolkit for newsrooms!"
        },
        {
            "day": "Thursday", 
            "description": "Readers are increasingly interacting with news content from a variety of locations, environments and levels of ability. As a result, news organizations need to think about creating platforms and stories that readers can access in as many ways as possible. This session will discuss best practices for web accessibility, graphics, closed captioning, and social media and facilitate a discussion about what news organizations are doing and how we can improve as an industry.", 
            "facilitators": "Joanna S. Kao, John Burn-Murdoch", 
            "id": "accessibility", 
            "length": "1 hour", 
            "room": "Classroom 305", 
            "time": "4-5pm", 
            "title": "Accessibility in media"
        },
        {
            "day": "Thursday", 
            "description": "Getting hundreds of reporters from different newsrooms in different countries to work together on the same project--and share--is the International Consortium of Investigative Journalists' (ICIJ) day-to-day challenge. For our latest investigation, the Panama Papers, we gathered more than 370 journalists from almost 80 countries to mine 11.5 million files. One of the missions of ICIJ's Data & Research Unit is to create the tools to make these collaborations happen seamlessly across borders. We've implemented social network platforms for reporters to communicate the findings, developed platforms to search over millions of documents and data and also to explore them visually. With reporters collaborating more and more across borders - or with different organizations - our challenge today could be yours tomorrow. Learn from our successes (and mistakes). \n\nWe want to share with you our experience in:\n\n* indexing and searching in documents ([Apache Solr](http://lucene.apache.org/solr/) and [Blacklight](https://github.com/projectblacklight/blacklight),\n* how to play with our structured data with the graph database [Neo4j](https://offshoreleaks.icij.org/pages/database),\n* and efficient and secure ways and tools to communicate with hundreds of journalists worldwide.\n", 
            "facilitators": "Miguel Fiandor", 
            "id": "tools-document-search", 
            "length": "1 hour", 
            "room": "Classroom 310", 
            "time": "4-5pm", 
            "title": "Tools to search millions of documents remotely and across borders"
        }
    ],
    [key('2016-07-29 10:30')]: [
        {
            "day": "Friday", 
            "description": "You've read about messaging apps and the rise of AI-driven conversational news interfaces — but what's really effective for a news bot and what's just a tedious iteration of Choose Your Own Adventure, or Excel Macros, or if-this-then-that statements by another name? Millie and SMI spent the last year thinking about what makes a news app sound like a smart interesting friend. In this session we'll workshop how to ensure your news bots don't get stuck in a boring valley of uncanny.", 
            "facilitators": "Millie Tran, Stacy-Marie Ishmael", 
            "id": "bots-need-humans", 
            "length": "1 hour", 
            "room": "Innovation Studio", 
            "time": "10:30-11:30am", 
            "title": "Why your bot is nothing without a human"
        },
        {
            "day": "Friday", 
            "description": "Audience development has become a hot, new buzzword inside nearly every news organization across the country. Everyone, it seems, is clamoring to hire an audience team. But what exactly is audience development? How do you find these magical creatures? What do they do? And can they really help connect your journalism with more people? The simple answer is yes. If you do it right. FRONTLINE has had an audience development team for four years, and it has been transformative. We've learned that when our editorial and audience teams work side by side, hand in hand we CAN make magic together. We've seen double and triple digit growth across multiple platforms. But the process isn't always easy, pretty or comfortable. In this session we'll have an open and honest conversation about our lessons learned. We'll share stories of success and failures. And we'll offer practical advice and tips for people who work in traditional newsrooms -- and for traditional bosses uncomfortable with thinking about audience. We'd also open it up to the room to hear more about how other newsrooms are approaching this.", 
            "facilitators": "Sarah Moughty, Pamela Johnston", 
            "id": "editorial-audience-development", 
            "length": "1 hour", 
            "room": "Classroom 305", 
            "time": "10:30-11:30am", 
            "title": "Break Down that Wall: Why Editorial and Audience Development Need to Work Together"
        },
        {
            "day": "Friday", 
            "description": "With the ‘silent movie' format of autoplaying Facebook News Feed videos, captioning has gone from being an accessibility concern, to being the primary hook many viewers will have into your video. Let's share examples of publishers making the most of this new creative format which demands a different story-telling style, combining text, animation and video. Optimising for this silent format is also a great reason to make your videos accessible through subtitles or closed-captions. Whether you're already captioning your videos or looking to get started let's go through recently developed tools for making this easier including crowdsourcing (Amara) and Speech To Text (Trint) and how you can integrate them into your workflows publishing on YouTube and Facebook.", 
            "facilitators": "Gideon Goldberg", 
            "id": "video-captioning", 
            "length": "1 hour", 
            "room": "Boardroom", 
            "time": "10:30-11:30am", 
            "title": "‘Insert Caption Here': how Facebook made video captioning cool"
        }
    ],
    [key('2016-07-29 12:00')]: [
        {
            "day": "Friday", 
            "description": "In newsrooms of old, jobs were pretty easy to understand (reporters, editors, photographers, illustrators), as were the responsibilities that went with those jobs. But newsrooms still can be old-school, so even if you write and deploy code, you still probably have some non-technical managers and peers. How do you help them better understand what you do? How can you work effectively together and stay on good terms? How do you pitch ideas to them, and how do they pitch ideas to you? How do you communicate about progress, priorities and problems, both on a daily basis and in a crisis? Let's talk about what's worked and what still needs improvement.", 
            "facilitators": "Gina Boysun, Justin Myers", 
            "id": "juggling-expectations", 
            "length": "1 hour", 
            "room": "Innovation Studio", 
            "time": "12-1pm", 
            "title": "Every day I'm juggling: Managing managers, peer expectations, and your own project ideas"
        },
        {
            "day": "Friday", 
            "description": "Visual journalism is on the rise. Recent articles highlight its importance in the future of news, but most focus on video and interactives. Few, if any, even mention photojournalism. Let's spend a session overcompensating. We'll take the challenges we're interested in, whether it's interactive storytelling, push notifications, audience engagement or anything else, and come up with the most photo-centric solutions. Then, we will bring all of these ideas together and try to figure out how and where photojournalism fits best in our constantly shifting vision of the future.", 
            "facilitators": "Neil Bedi", 
            "id": "photojournalism-future-news", 
            "length": "1 hour", 
            "room": "Classroom 305", 
            "time": "12-1pm", 
            "title": "Where does photojournalism fit in the future of news?"
        },
        {
            "day": "Friday", 
            "description": "When dealing with data that encapsulates the lives of hundreds, or even thousands, of people, keeping those people from becoming anonymous numbers can be challenging. In this session, we walk through tactics and strategies for keeping humanity at the centre of complex stories, and avoiding losing our audience while exploring the sheer scale of some of these data stories. We will use the evolution -- from early stage design sketches to version 3 finished product -- of the CBC's award-winning investigation into missing and murdered aboriginal women across Canada as some of our guiding examples through this discussion.", 
            "facilitators": "William Wolfe-Wylie", 
            "id": "people-data-stories", 
            "length": "1 hour", 
            "room": "Boardroom", 
            "time": "12-1pm", 
            "title": "Keeping people at the forefront of data stories"
        }
    ],
    [key('2016-07-29 14:30')]: [
        {
            "day": "Friday", 
            "description": "Science Fiction authors often embed deep insights into the future of technology within their stories. Come to this session to share examples of fascinating science fictional treatments of media and networked communication with other attendees and geek out about who got it right and who may yet come out correct. (My idea is to solicit ahead of time 4-6 super fans who are willing to give low-key lightning talks summarizing plots with an emphasis on the interesting media bits.)", 
            "facilitators": "Joe Germuska", 
            "id": "media-science-fiction", 
            "length": "1 hour", 
            "room": "Innovation Studio", 
            "time": "2:30-3:30pm", 
            "title": "Through an iPhone Darkly: Media and Networks through the lens of Science Fiction"
        },
        {
            "day": "Friday", 
            "description": "As more news organizations turn an eye to analytical measurement, it is important to discuss what we're actually trying to measure when we use analytics. Often, that comes down to defining what success means for your storytelling. This session will help you to think about your stories and your needs before you start thinking about analytics. With a strong definition of success, it becomes easier to define success measurements. We will share different tools for creating success measurements as well.", 
            "facilitators": "Tyler Fisher, Sonya Song", 
            "id": "better-analytics", 
            "length": "1 hour", 
            "room": "Classroom 305", 
            "time": "2:30-3:30pm", 
            "title": "Better Analytics: Why You Have to Define Success Before You Use Analytics — And How To Do It"
        },
        {
            "day": "Friday", 
            "description": "Strong communities start with one-on-one relationships that grow into networks. But what if you're a lonely coder, a student, or someone in a remote area without constant access to the wider news nerd network? Let's brainstorm ways to better facilitate connections between individuals in the community – perhaps through online meetings for project feedback or career advice. What would you want help with? How would you want to help someone else? What could these meetings look like? What would make them successful?", 
            "facilitators": "Julia Smith", 
            "id": "remote-mentorship", 
            "length": "1 hour", 
            "room": "Boardroom", 
            "time": "2:30-3:30pm", 
            "title": "Give and Receive: Can we strengthen our community through remote mentorship and office hours?"
        }
    ],
    [key('2016-07-29 16:00')]: [
        {
            "day": "Friday", 
            "description": "**This session would be great for you if you're comfortable working collaboratively (sketching and sharing) in small groups.**\n\nWriting down processes, goals, and workflows is an important part of building healthy, transparent, and collaborative teams. But finding time to write and making sure that people read those documents is a constant challenge. This activity-based brainstorm session will lean into the expertise and experience of attendees to explore methods for building solid documentation practices into a team's culture.", 
            "facilitators": "Kelsey Scherer, Lauren Rabaino", 
            "id": "documentation-culture", 
            "length": "1 hour", 
            "room": "Innovation Studio", 
            "time": "4-5pm", 
            "title": "How can teams build a consistent culture of documentation?"
        },
        {
            "day": "Friday", 
            "description": "The BBC have been lucky enough to get a great undergraduate trainee programme up and running over the last 8 years. It's a really good way to get enthusiastic talented graduates into the organisation. But internships aren't without their issues. Andrew Leimdorfer (BBC) and Annie Daniel (Texas Tribune) will facilitate a conversation about people's experiences running internships and what it's like to be an intern. It's going to be conversation, so come along prepared to share stories, offer your own advice and ask questions.", 
            "facilitators": "Andrew Leimdorfer, Annie Daniel", 
            "id": "internships", 
            "length": "1 hour", 
            "room": "Classroom 305", 
            "time": "4-5pm", 
            "title": "Running undergraduate internships that produce great newsroom developers"
        },
        {
            "day": "Friday", 
            "description": "Faced with the drive to program to remote partners, apps, and corporate-owned-and-operated chat platforms, we find ourselves rolling the dice on a future that seems to call for a referendum on The Web. As the tools we use for storytelling become not just more diverse but more constrained by the spectre of Terms Of Service, can we hedge our bets? Or to put it a different way, does our work to serve both third-party platforms and the websites that serve as our foundations actually constitute a zero-sum game? This session proposes that, by stepping back, we can imagine a workflow and toolset that serves both needs—and, by extension, newsrooms—even better than the current generation of content management systems. In order to investigate this approach, we will ask three questions: 1. Rather than abandon the benefits that the web affords us as a structure, how can we carry with us the ethos and process of the web as we negotiate these new platforms? 2. Can our industry call upon a history of standards and protocols to avoid partner lock-in? 3. Should our tools pivot from a focus on authorship to one of reportage and remixing, allowing us to use new platforms in focused ways without losing control over the source material? What if the web is the best idea? How can we retain the imperatives of the web as we serve the future of storytelling, and what are the kinds of tools and standards we can rally around to preserve that context while allowing us to experiment in other people's walled gardens?", 
            "facilitators": "David Yee", 
            "id": "platforms-web-storytelling", 
            "length": "1 hour", 
            "room": "Boardroom", 
            "time": "4-5pm", 
            "title": "Get you a CMS that can do both: Platforms, the web, and storytelling imperatives"
        }
    ]
}
