/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

A Slackbot that posts reminders into a Slack channel when SRCCON 2017 sessions
with live transcripts are about to start. Built with Botkit.

Uses node-cron to run a job every minute that checks timestamps
and sends an alert if sessions are about to start.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

// Botkit is so good
var Botkit = require('botkit');

// are we in debug mode? If `true`, messages will only be sent
// to the OpenNews Slack team
var debug = true;

// if we're running locally, look for credentials in an env.js file that's
// not in the repo. In production, set credentials as Heroku config vars.
if(!process.env.CLIENTID) {
    require('./env.js')
}

// the bot needs these three things, given to you when you create
// a new Slack app: https://api.slack.com/apps
var CLIENTID = process.env.CLIENTID,
    CLIENTSECRET = process.env.CLIENTSECRET,
    PORT = process.env.PORT;

if (!CLIENTID || !CLIENTSECRET || !PORT) {
    console.log('Error: Specify CLIENTID, CLIENTSECRET, and PORT in environment');
    process.exit(1);
}

// use redis datastore for team/channel information, provided
// by REDISTOGO if we're on Heroku
if (process.env.REDISTOGO_URL) {
    var redisConfig = {
        'url': process.env.REDISTOGO_URL
    }
} else {
    var redisConfig = {};
}
var redisStorage = require('botkit-storage-redis')(redisConfig);

// fire up our Slackbot, where we only need an `incoming-webhook`
var controller = Botkit.slackbot({
    storage: redisStorage
    //json_file_store: './db_slackbutton_incomingwebhook/'
}).configureSlackApp({
    clientId: CLIENTID,
    clientSecret: CLIENTSECRET,
    scopes: ['incoming-webhook'],
});

// the code below expects a timezone string in a few places,
// so let's make sure we're consistent across all of them.
// This should be set to the timezone where the physical event
// is taking place. We're in Minneapolis for 2017
var currentTimezone = 'America/Chicago';

// make sure moment forces all time comparisons to `currentTimezone`
var moment = require('moment-timezone');
moment.tz.setDefault(currentTimezone);

// this is the function called by the cron job each minute. Gets current time
// at minute precision to avoid millisecond shenanigans. Matches string format
// against keys in `transcripts` object to see if any alerts should be sent.
var checkTimeMatch = function() {
    var now = moment().startOf('minute'),
        match = transcripts[now.format('YYYY-MM-DD HH:mm')];

    if (match) {
        sendAlert(match);
    } else {
        console.log('Checked at '+now.format());
    }
}

// given a `timeblock`, gets data from `transcripts` object and formats
// into Slack-compatible messages. Then passes each into postToSlack()
// to handle sending to each subscribed Slack team. Can send a plaintext
// message instead if passed a `message` param.
var sendAlert = function(timeblock, message) {
    if (message) {
        postToSlack(message)
    } else {
        timeblock.forEach(function(transcript) {
            var attachments = [{
                'thumb_url': 'https://srccon.org/media/img/srccon_logo_angle_75.png',
                'pretext': ':speech_balloon::tada: A SRCCON 2018 session with live transcription is about to start!',
                'fallback': `A SRCCON 2018 session with live transcription is about to start: ${transcript.title}. Open the live transcript at https://aloft.nu/conf?name=srccon&session=2018-${transcript.id}.`,
                'color': '#F79797',
                'title': transcript.title,
                'title_link': 'https://aloft.nu/conf?name=srccon&session=2018-'+transcript.id,
                'text': transcript.description,
                'fields': [
                    {
                        'title': 'Facilitator(s)',
                        'value': transcript.facilitators,
                    },
                    {
                        'title': 'Transcript',
                        'value': `<https://aloft.nu/conf?name=srccon&session=2018-${transcript.id}|Open the live transcript>`,
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

// sends a message to all subscribed Slack teams. Pass in a `text` string
// to send a plaintext alert. Pass in an `attachments` object to send
// a Slack-formatted message.
var postToSlack = function(text, attachments) {
    controller.storage.teams.all(function(err, teams) {
        var count = 0;
        for (var t in teams) {
            if ((!debug && teams[t].incoming_webhook) || (debug && teams[t]['name'] == 'OpenNews' && teams[t].incoming_webhook)) {
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

// sets up an oauth endpoint at https://BOT_SITE/oauth. This is
// the Redirect URI you give your Slack app to use for authentication
controller.setupWebserver(PORT, function(err, webserver) {
    controller.createOauthEndpoints(controller.webserver, function(err, req, res) {
        if (err) {
            res.status(500).send('ERROR: ' + err);
        } else {
            //res.send('Success!');
            res.redirect('https://srccon.org/slackbot/success/');
        }
    });
});

// provides an onboarding message when a Slack team first authenticates the bot
controller.on('create_incoming_webhook', function(bot, webhook_config) {
    bot.sendWebhook({
        text: ':thumbsup: SRCCON Transcript Alerts are ready to roll! Each time a session with live transcription is about to begin, we\'ll post details and a link to the live transcript right here.'
    });
})

// data specific to SRCCON 2017. Keys are string-formatted datetimes forced
// to `currentTimezone` to match the `now` moment created by `checkTimeMatch`.
// Values are lists of session objects that can be passed into `sendAlert`
// and formatted for sending to Slack.
var key = d => moment.tz(d, currentTimezone).format("YYYY-MM-DD HH:mm");
var transcripts = {
    [key('2018-06-22 19:39')]: [
        {
            "day": "Thursday", 
            "description": "It happens all the time. We parachute into a community for a short time because something \"newsworthy\" happens rather than coming in to stay and maintain a steady relationship. Think Sutherland Springs and other locales of mass shootings. Think rural America and the 2016 presidential election. Think of the minority areas of our communities that remain underserved, underrepresented and without coverage aside from tragedies. \n\nHow do we put down the ripcord and instead pull up a chair in these communities? \n\nLet's spend some time learning how to do a baseline assessment of our news organization's coverage of diverse communities using analytics tools we already use everyday to identify blind spots. Let's arm ourselves with actionable strategies we can use when we return to our newsrooms and can use to have these difficult conversations about our coverage's shortcomings with top decision-makers. And finally, let's devise a set of best practices to engage diverse communities in the interim between news events and build lasting future relationships.", 
            "everyone": "", 
            "facilitators": "Dana Amihere", 
            "facilitators_twitter": "write_this_way", 
            "id": "blind-spots-coverage", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Johnson", 
            "time": "10-11:15am", 
            "timeblock": "thursday-am-1", 
            "title": "Managing the blind spots in community news coverage", 
            "transcription": "y"
        }, 
        {
            "day": "Thursday", 
            "description": "You're in a technical role in a newsroom and you find yourself in one of two positions: The Asker, where you gather project pieces from different contributors to create a product; or the Person Being Asked, where you must parse people's technical needs into a tangible plan of action. Getting what you need is an art for any developer who also wears a project management hat. But how to ask? Or how to dig in to find out where a question is stemming from? What's the best way to communicate with people eager to help, but who may not understand the technical challenges? Many of the technical problems developers experience can be fixed with clear communication among mixed teams where everyone's expertise is validated, so we’ll be sharing tips, common pitfalls and experiences on how to manage a project from vision to reality. This session will be part open round table discussion, and part small groups and games.", 
            "everyone": "", 
            "facilitators": "Lauren Flannery, Karen Hao", 
            "facilitators_twitter": "LaurenFlannery3, _KarenHao", 
            "id": "navigating-technical-communication", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Ski-U-Mah", 
            "time": "10-11:15am", 
            "timeblock": "thursday-am-1", 
            "title": "Navigating technical communication with journalists", 
            "transcription": "y"
        }, 
        {
            "day": "Thursday", 
            "description": "The practice of interviews in your daily collaboration with coworkers—whether in mentorship conversations, working with or as managers, moderating panels, conducting user research, or building products—is an incredibly valuable craft to hone. Engaging in a dialogue built on questions (especially at the intersection of journalism and technology) can help you better understand the people on your teams and surface the stories that inform their lived experiences—using those experiences to help you make smarter decisions and build better and more thoughtful products. \n\nLet's discuss how to: build constructive listening skills, use different classes of questions to guide and evaluate conversation, build a line of reasoning from a conversation as it evolves, and frame really productive interviews in service of getting to know your subject. Participants will spend time both asking and responding to questions in unstructured interviews, and we’ll reflect as a group on the practice and outcomes. At the end, you should walk away from this session not just with the tools you need to start building interviews into your daily work, but with a keener understanding of the skill of intense, focused listening.", 
            "everyone": "", 
            "facilitators": "David Yee", 
            "facilitators_twitter": "tangentialism", 
            "id": "listening-asking-questions", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Thomas Swain", 
            "time": "10-11:15am", 
            "timeblock": "thursday-am-1", 
            "title": "The Interview: Building a practice of listening and asking questions in our work", 
            "transcription": "y"
        }
    ],
    [key('2018-06-28 11:45')]: [
        {
            "day": "Thursday", 
            "description": "‘Membership’ and ‘reader revenue’ have become media buzzwords. But how do you build and measure the success of your own membership program? What tools do you use to listen to readers, and what data do you track to make decisions about product offerings? Anika Gupta and Andrew McGill are senior product managers at the Atlantic, where they work on the organization’s Masthead membership program. Anika’s also a former researcher with the Membership Puzzle Project in New York. They’ll review the Atlantic’s approach to building their membership program, as well as MPP’s research on best practices and ‘thick’ versus ‘thin’ models of participation. The session will start with some user research exercises, discuss MPP’s theory and the Atlantic’s implementation, then break into small teams for workshops and brainstorming exercises focused on designing the right membership program and offerings for your organization.", 
            "everyone": "", 
            "facilitators": "Anika Gupta, Andrew McGill", 
            "facilitators_twitter": "DigitalAnika, andrewmcgill", 
            "id": "radical-listening-membership", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Johnson", 
            "time": "11:45am-1pm", 
            "timeblock": "thursday-am-2", 
            "title": "Radical listening - How do you design a media membership program focused on participation", 
            "transcription": "y"
        }, 
        {
            "day": "Thursday", 
            "description": "It's easier for me to see what The New York Times published in print in 1851 than it is to see what it published digitally in 1996. Why is that? Is any other news website in a better state?\n\nDigital publishing moves fast, but as we evolve the form of news online, how can we preserve what we publish in a way that will let the historians of the future understand the evolution of the medium? Is a SoundSlides audio slideshow going to work in any way in 50 years? Or a Brightcove player video? If you do archive a page, has it lost something essential if it's lost the dynamic ad code or personalization features?\n\nThese are hard questions, but let's try and come together and create a plan for pitching the value of preserving and archiving digital news to others at our organizations, and start creating best practices for doing it.", 
            "everyone": "", 
            "facilitators": "Albert Sun, Kathleen Hansen", 
            "facilitators_twitter": "albertsun, khans1", 
            "id": "archiving-news-websites", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Ski-U-Mah", 
            "time": "11:45am-1pm", 
            "timeblock": "thursday-am-2", 
            "title": "Archiving News Websites for the Long Long Term", 
            "transcription": "y"
        }, 
        {
            "day": "Thursday", 
            "description": "Are you a freelancer or a lonely coder looking for feedback as you’re working on your latest project? Do you work on a team with access to an editor but they don’t have the right experience or skills to review your work? \n\nNo matter your level of expertise, having a skilled pair of eyes thoroughly scan your code, design, or writing is a crucial step in producing quality journalism. Enter the role of editor. Having a good editor is a truly amazing experience. Not only can a good editor help point out the errors in the text or the flaws in a design, but they can also offer guidance on story structure, layout, etc). Their feedback can make the difference between an average piece and an impactful piece.\n\nSo what can you do if that resource isn’t available to you? How can you shape stories without the keen eye of an editor?\n\nHere’s the thing, none of us have the perfect answer. In this session, we want to share some of our strategies and we want you to hear what solutions you’ve come up with.", 
            "everyone": "", 
            "facilitators": "Lo Benichou, Casey Miller", 
            "facilitators_twitter": "lobenichou, caseymmiller", 
            "id": "working-without-editors", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Thomas Swain", 
            "time": "11:45am-1pm", 
            "timeblock": "thursday-am-2", 
            "title": "Don’t Panic: the guide to working without an editor, even if you have one sitting right next to you", 
            "transcription": "y"
        }
    ],
    [key('2018-06-28 14:30')]: [
        {
            "day": "Thursday", 
            "description": "An editor, a designer, an engineer, and a product person walk into a room…\n\nIt sounds like the start of a corny joke, but increasingly we find ourselves in these types of situations - small, interdisciplinary teams working together to solve a problem. The thinking says - throw a lot of really smart people in a room and -magic!- they will figure it out! \n\nThe reality is, it does work, but it’s extremely difficult. People misunderstand each other, and motivations and goals are not often articulated, leading to disarray. Working with new people is hard, and it’s especially hard when you have to move fast and you’re not all speaking the same language! But fear not - starting things off on the right foot can have huge payoffs - team buy-in, alignment, and trust. The goal is to get the team to move faster by getting some tough conversations out of the way. \n\nThis is an interactive session in which participants will simulate this exact situation - participants will be given a problem prompt, break out into small, cross-disciplinary teams, then participate in kickoff exercises designed to force hard conversations and perhaps give participants a moment of self-reflection - \"are you an order or chaos muppet?\", hopes/fears/sacred cows, the road to nirvana, the pre-mortem - and more! \n\nThese exercises work best for teams with 5-10 members with any combination of disciplines, but can be scaled up or down as needed.  ", 
            "everyone": "", 
            "facilitators": "Rosy Catanach, Sara Bremen Rabstenek", 
            "facilitators_twitter": "", 
            "id": "kickoff-kit", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Johnson", 
            "time": "2:30-3:45pm", 
            "timeblock": "thursday-pm-1", 
            "title": "Kickoff Kit: helping new teams move faster by aligning early", 
            "transcription": "y"
        }, 
        {
            "day": "Thursday", 
            "description": "The traditional academic-journalist relationship goes like this: a journalist would talk to an academic as a source and expert for a story. An academic would reach out to the media with findings published in a new paper. But are there ways to forge deeper relationships and bring researchers into the reporting process? Is there a way for journalists to shape research questions to quantify anecdotes they encounter in their reporting? What do journalists bring to the table for academics and vice versa?\n\nThrough discussion and activities we’ll envision new relationships between research teams, journalists, and the public. We’ll all talk about our experiences with these types of collaborations, what has and hasn’t worked, and how we might upend the the traditional one-way flows from research -> journalism -> public. We’re a journalist who’s been partnering with academics to produce stories and a researcher whose work has been reported on with varying degrees of collaboration. Whether you’re an academic or a journalist or both or neither, come join us to think outside of the box about how these partnerships can enrich journalism and increase access to information.", 
            "everyone": "", 
            "facilitators": "Laura Laderman, Sinduja Rangarajan", 
            "facilitators_twitter": "liladerm, cynduja", 
            "id": "academia-journalism-partnerships", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Ski-U-Mah", 
            "time": "2:30-3:45pm", 
            "timeblock": "thursday-pm-1", 
            "title": "Off the shelf and into the open: forging academia-journalism partnerships to bring findings out of journals and original research into reporting", 
            "transcription": "y"
        }, 
        {
            "day": "Thursday", 
            "description": "Increasingly, journalists don't just visualize data in raw form but build simple regression models that draw trendlines through a set of data points, telling the reader where the story runs through the dataset. In more advanced forms, reporters fill in gaps of missing data with an original simulation or draw connections between data points with a model.\n\nWhen journalists lean on statisticians' tools, we take on the same responsibilities for accuracy and fairness even as the methods we use change. Statistical techniques can falsely frame or overstate the importance of a trend or relationship between data points when used carelessly.\n\nLet's talk about what basic assumptions and considerations journalists should make when using statistical methods, and what kinds of red flags statisticians look for in bad model selection or diagnosis. How should a journalist should be thinking about these questions as opposed to a social scientist or researcher? What are some basic techniques all journalists should know when running data through a regression model? Let's also introduce some more advanced techniques that can teach us to see our data in new ways and open future discussions.", 
            "everyone": "", 
            "facilitators": "Sam Petulla, Hannah Fresques", 
            "facilitators_twitter": "spetulla, HannahFresques", 
            "id": "stats-newsroom", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Thomas Swain", 
            "time": "2:30-3:45pm", 
            "timeblock": "thursday-pm-1", 
            "title": "Regression in the newsroom: When to use it and thinking about best practices", 
            "transcription": "y"
        }
    ],
    [key('2018-06-28 16:15')]: [
        {
            "day": "Thursday", 
            "description": "What drives people to pay for journalism? Is it access to exclusive content? Incentives in the UX? Affordability? Attitudes and beliefs? Or is it something else? Together we’ll work through some universal ways of thinking about compelling people to support journalism with money. The session will begin with brainstorming to identify the reasons people pay for journalism. We’ll sort those ideas to find common themes that - surprise! - exist in any news organization, whether its focus is global, local or something in between. We’ll end with an exercise to develop ideas for real-world implementation so that everyone leaves the room with at least one concrete plan that they think will get their readers to pay for news.", 
            "everyone": "", 
            "facilitators": "Sara Konrad Baranowski, Matt Raw", 
            "facilitators_twitter": "skonradb, Mattbot", 
            "id": "readers-pay-news", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Johnson", 
            "time": "4:15-5:30pm", 
            "timeblock": "thursday-pm-2", 
            "title": "Without Free or Favor: Compelling readers to pay for news (tote bags not included)", 
            "transcription": "y"
        }, 
        {
            "day": "Thursday", 
            "description": "Data journalism education has problems -- too few places teach it, too few faculty have the skills, and there's precious little consensus about what students need. Tools? Thinking? Case studies? Story assignments? Simultaneously, academic publishing is beyond broken: too slow to keep up, too expensive for students to afford. So we're on a mission: Make the mother of all modern data journalism textbooks. And, at the same time, publish it so it can get to the most students, with the most up-to-date materials, without academic publishing price barriers. But how? We need your help. What do we include? How do we get it to people? We have ideas, we want to hear yours. Let's make a table of contents together!", 
            "everyone": "", 
            "facilitators": "Matt Waite, Sarah Cohen", 
            "facilitators_twitter": "mattwaite, sarahcnyt", 
            "id": "data-journalism-textbook", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Ski-U-Mah", 
            "time": "4:15-5:30pm", 
            "timeblock": "thursday-pm-2", 
            "title": "Let's build the data journalism textbook we need, and break academic publishing while we're at it. ", 
            "transcription": "y"
        }, 
        {
            "day": "Thursday", 
            "description": "How might newsrooms create an ethical framework around their engagement work, similar to a code of conduct for staff relationships? \n\n\"Engagement\" is becoming more central to newsroom revenue models, and with it comes a lot of thorny issues that start with the question: \"*why* exactly are you trying to engage the public?\" If the answer doesn't include \"to learn and in-turn create more useful content for the public\" than it's worth interrogating the purpose of that work and the forces at play calling for something else. \n\nThis session will be an in depth discussion around the issues surrounding engagement work, and we'll emerge with a shareable framework for newsrooms to use when orienting toward non-extractive models. ", 
            "everyone": "", 
            "facilitators": "Jennifer Brandel, Andrew Haeg", 
            "facilitators_twitter": "JenniferBrandel, andrewhaeg", 
            "id": "ethical-engagement", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Thomas Swain", 
            "time": "4:15-5:30pm", 
            "timeblock": "thursday-pm-2", 
            "title": "Toward an ethical framework for engagement", 
            "transcription": "y"
        }
    ],
    [key('2018-06-29 10:00')]: [
        {
            "day": "Friday", 
            "description": "When most journalists listen, all we are doing is waiting for the next opportunity to ask a question of a source or community member. Rarely do we employ active listening - a practice that could help us when trying to reach neglected audiences. Through a series of guided exercises in small groups, we will talk about how _really_ listening can change the way journalists do their jobs and about the culture change required in newsrooms to achieve this goal. Our jumping-off point will be the findings from a spring thought leader summit that the American Press Institute held in Nashville. We expect participants will have many of their own experiences - both highs and lows - to share with each other.", 
            "everyone": "", 
            "facilitators": "Amy L. Kovac-Ashley, David Plazas", 
            "facilitators_twitter": "terabithia4, davidplazas", 
            "id": "talk-less-listen-more", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Johnson", 
            "time": "10-11:15am", 
            "timeblock": "friday-am-1", 
            "title": "Talk Less. Listen More. How Listening Can Help Journalists Begin to Repair Relationships with Marginalized or Ignored Communities", 
            "transcription": "y"
        }, 
        {
            "day": "Friday", 
            "description": "A “words” journalist can spend their entire career as a reporter, starting with daily general assignment reporting and moving to beat reporting, international reporting, or investigative reporting. Along the way, they increase their visibility, credibility, and earnings. What could that look like for the journalism-tech community? For example, a “news nerd” version of a traditional foreign correspondent could uncover datasets abroad, figure out ways to engage the local community, or deploy hardware sensors to track environmental conditions.\n\nFirst, we’ll interview each other to identify the range of skills we bring to newsrooms and the skills we want to acquire to get our next opportunity. We’ll look at the skills and brainstorm both new jobs and ways to rethink currently existing jobs. What sort of organization or team would need or want this role to exist, and why? Then, we’ll share our ideas with the larger group.", 
            "everyone": "", 
            "facilitators": "Soo Oh, Martin Stabe", 
            "facilitators_twitter": "soooh, martinstabe", 
            "id": "job-listings-career", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Ski-U-Mah", 
            "time": "10-11:15am", 
            "timeblock": "friday-am-1", 
            "title": "Reimagining news nerd career paths", 
            "transcription": "y"
        }, 
        {
            "day": "Friday", 
            "description": "So, your code broke the internet, but nobody's noticed yet. Not long ago the NPRViz team got a report from one of their users about a pretty serious security flaw in Pym.js, and so suddenly found themselves with the challenge of figuring out how to notify Pym users they needed to upgrade immediately without just blasting out to the world that it was possible to steal their users session data & cookies.  I (and others) ended up helping them walk through the security disclosure process, helped draft messages intended to encourage users to upgrade, and poked people in the community.  There are individual things that folks who produce software for others can do to make this process easier for themselves & users, but also there are things that we should be doing as users to make sure we're prepared to upgrade when flaws are announced, and also, how to lend a hand when things are going wrong.  Lets talk about what _more_ we can and should be doing.\n", 
            "everyone": "", 
            "facilitators": "Ted Han, Mike Tigas", 
            "facilitators_twitter": "knowtheory, mtigas", 
            "id": "security-prep", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Thomas Swain", 
            "time": "10-11:15am", 
            "timeblock": "friday-am-1", 
            "title": "Preparing for security vulnerabilities if you're an open source maintainer *or* user", 
            "transcription": "y"
        }
    ],
    [key('2018-06-29 11:45')]: [
        {
            "day": "Friday", 
            "description": "Privacy is coming to the forefront of national conversation (again) and many non-EU publishers are discovering late in the game they need to comply with the EU privacy laws like the GDPR - or block all EU traffic. California is pondering similar laws, Canada might follow Europe’s approach and the ad industry scrambles to adapt.\n\nWe are all responsible for the state of internet privacy. Whether you are adding “that one line of JavaScript” as requested by the marketing team, or the Instagram embed in your article. We are allowing our readers (which includes us too) to be tracked across the internet in ways we don’t know about or very often can’t explain.\n\nThis session will start with real and practical approaches to lockdown your site from a privacy perspective (with source code) and best practices on how to minimize data collection and tracking on your visitors. \n\nIt will include a larger discussion to share notes, strategies, concerns from news organizations on how we can improve and do better. The goal is that participants are more aware of the issues, and armed to grapple with privacy concerns in their organizations.", 
            "everyone": "", 
            "facilitators": "Michael Donohoe, Matt Dennewitz", 
            "facilitators_twitter": "donohoe, mattdennewitz", 
            "id": "restoring-reader-privacy", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Johnson", 
            "time": "11:45am-1pm", 
            "timeblock": "friday-am-2", 
            "title": "Restoring our reader’s privacy in a time of none", 
            "transcription": "y"
        }, 
        {
            "day": "Friday", 
            "description": "News nerd teams within various orgs have been working really hard on developing newer hiring practices, including acrobatics like double-blind initial screenings, unbiased assessments of resumes, standardized interview processes, and rigorous, team-consensus evaluations. It’s ridiculously time-intensive but 1,000% worth it -- these efforts have resulted in diverse, talented finalist pools. We have a window available now for getting ahead of any given news org’s “rebooted” corporate recruiting and hiring efforts.\n\nNews nerd teams can cut the trail by adopting hiring practices that truly put our shared ideals front and center, as a demonstration for newsroom and technology groups. Like-minded news nerds like Brittany Mayes and Sisi Wei have spoken eloquently about their efforts for internships and fellowships. SRCCON audiences have been appreciative and very attentive, which means there’s more to uncover on the topic. There’s a lot to share, so come join us and take home some low-frills ideas about how to push your hiring efforts forward.", 
            "everyone": "", 
            "facilitators": "Tiff Fehr, Ryann Grochowski Jones", 
            "facilitators_twitter": "tiffehr, ryanngro", 
            "id": "hacking-hiring", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Ski-U-Mah", 
            "time": "11:45am-1pm", 
            "timeblock": "friday-am-2", 
            "title": "Leading News Orgs to Water by Hacking Our Hiring", 
            "transcription": "y"
        }, 
        {
            "day": "Friday", 
            "description": "OpenNews and the BuzzFeed Open Lab collaborated with a ton of really smart journalists, editors, and trainers to compile a resource guide for newsroom security trainers. (https://securitytraining.opennews.org/). It's a great round up of new lesson plans and links out to existing lessons that cover important topics in digital privacy and security. We'd love to show you what's in the guide and spend some time adding even more resources to it. If you have lesson plans to share or just a few favorite resources or news stories that really make sense of a particular topic, bring them!", 
            "everyone": "", 
            "facilitators": "Amanda Hickman, Kevin O'Gorman", 
            "facilitators_twitter": "amandabee, heretohinder", 
            "id": "security-trainers", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Thomas Swain", 
            "time": "11:45am-1pm", 
            "timeblock": "friday-am-2", 
            "title": "More security trainers, please!", 
            "transcription": "y"
        }
    ],
    [key('2018-06-29 14:30')]: [
        {
            "day": "Friday", 
            "description": "As digital journalists, we often push the platform forward, with cool new interactives and high-impact layouts. Unfortunately, accessibility is often ignored in the process. It's easy to make excuses: we're on deadline, or visual content wouldn't work in a screen reader anyway. But what if it's far easier than you think? In this session, we'll set up accessibility tools, share lessons we've learned about creating inclusive pages, and assemble a list of easy wins that you can take back to your newsrooms and digital teams.", 
            "everyone": "", 
            "facilitators": "Thomas Wilburn, Joanna Kao", 
            "facilitators_twitter": "thomaswilburn, joannaskao", 
            "id": "visualization-civil-right", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Johnson", 
            "time": "2:30-3:45pm", 
            "timeblock": "friday-pm-1", 
            "title": "Visualization as a Civil Right", 
            "transcription": "y"
        }, 
        {
            "day": "Friday", 
            "description": "What have you built that’s now ignored? What took off and is now central to your newsroom’s daily grind? What was the difference?\n\nWe’re a product manager in New York and an editor in D.C., on the front lines of making and deciding to use a variety of tools, from those that help with daily coverage planning to chart-making to immersive storytelling. Let's talk about what's lived on and what's languished so that we can crack the code on building tools journalists actually use.\n\nOne strong hunch of ours: We can take concrete steps to deepen relationships between folks who see opportunities to solve problems (or stand to benefit) and those who are building the solutions.\n\nLet’s find themes in our boondoggles and wild successes and come away with an invaluable compilation of battle-tested advice to guide your next project.", 
            "everyone": "", 
            "facilitators": "Becky Bowers, Tyler Chance", 
            "facilitators_twitter": "beckybowers, tchance121", 
            "id": "using-tools", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Ski-U-Mah", 
            "time": "2:30-3:45pm", 
            "timeblock": "friday-pm-1", 
            "title": "Sure, You're Making Tools. But Do People Use Them?", 
            "transcription": "y"
        }, 
        {
            "day": "Friday", 
            "description": "Our phones are incredibly intimate devices. We lovingly cradle them and stare into their gently glowing screens at all hours of the day. In this session, we will explore methods for using that intimacy to build authentic personal relationships with audiences via SMS – without being spammy or creepy.\n\nParticipants should bring a recent or upcoming story, and together we will conceive, script, and prototype a SMS campaign to connect with your audience.\n\nWe’ll touch on topics including: message tone and frequency, what to send people and when, choosing the right technology platform, potential costs, legal considerations, as well as common pitfalls and tactics for overcoming them. We’ll also share some of our data on how building respectful SMS products has impacted membership.", 
            "everyone": "", 
            "facilitators": "Sam Ward, Hannah Young", 
            "facilitators_twitter": "sward13", 
            "id": "audience-sms", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Thomas Swain", 
            "time": "2:30-3:45pm", 
            "timeblock": "friday-pm-1", 
            "title": "New phone, who dis: Building intimate audience relationships without the creep factor.", 
            "transcription": "y"
        }
    ],
    [key('2018-06-29 16:15')]: [
        {
            "day": "Friday", 
            "description": "If you are a news nerd, you probably know how to make data graphics in just a few lines of code, whether in d3, R, or python. But computer tools can restrict your creativity by making you think inside the box, both figuratively and literally. \n\nIn this session, we'll bust out the markers, paper, stickers, string, balloons, and other fun stuff. We'll practice iterating on ideas, freed from the computer. Inspired by the work of Mona Chalabi (who uses hand-drawn visualizations to make her work more accessible), Stefanie Posavec and Giorgia Lupi (who embarked on a year-long personal data collection postcard project which became the book Dear Data), and Jose Duarte (of Handmade Visuals), we will play with color, shape, size, and texture. \n\nI'll provide some supplies, but you're welcome to bring your own! Do you have a pack of Prismacolor markers burning a hole in your pocket? A washi tape collection that never sees the light of day? We can visualize data with that! ", 
            "everyone": "", 
            "facilitators": "Amelia McNamara", 
            "facilitators_twitter": "AmeliaMN", 
            "id": "visualizing-data", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Johnson", 
            "time": "4:15-5:30pm", 
            "timeblock": "friday-pm-2", 
            "title": "Visualizing data by hand", 
            "transcription": "y"
        }, 
        {
            "day": "Friday", 
            "description": "Let’s be clear: a lot of experimentation is happening in newsrooms right now. But let’s also be honest: it’s predominantly being done in a messy, ad-hoc way and we’re too quick to move on. As more teams are given the freedom to experiment, the need for a practical model to do it with empathy, intention and a willingness to learn is ever greater. \n\nOver two years in the Guardian Mobile Innovation Lab we developed a sustainable process for running experiments by trying methods out until they (mostly) worked for us. In this session,  we’ll talk about the essential building blocks of our process, take it for a test run, and invite others to share methods they’ve used in their newsrooms. \n\nThe Mobile Lab’s methodology on its surface is pretty simple: \n* draw a line between an idea and an actual hypothesis\n* define success metrics based on all aspects of a user’s experience\n* implement precise analytics\n* survey your audience about how things went\n* have a “burndown” meeting with the entire team to discuss results and insights\n\nThe hard part, we admit, is putting this all together and not losing steam. \n\nFeel free to bring a news experiment idea you want to put through the paces, or we’ll have a few on file to suggest (Obituaries newsletter, anyone?!)", 
            "everyone": "", 
            "facilitators": "Sarah D Schmalbach, Sasha Koren", 
            "facilitators_twitter": "schmalie, sashak", 
            "id": "running-experiments", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Ski-U-Mah", 
            "time": "4:15-5:30pm", 
            "timeblock": "friday-pm-2", 
            "title": "Are you running an experiment, or are you just winging it?", 
            "transcription": "y"
        }, 
        {
            "day": "Friday", 
            "description": "Ever wish you had a roadmap for how to bridge all the different ways we work in a modern newsroom? There are data journalists, developers, traditional beat reporters…and what does a producer do, anyway? This session is for all of you. Everyone will leave with their own personal roadmap, a one-sheet list that will come out of collaborative brainstorming. The point is to better understand ourselves, where we are situated and how to communicate in order to collaborate once we are back in our own newsrooms. Come and build your own map by joining us.\n\nAs we are all experiencing with the intersection of tech and journalism, journalists have to work with developers, data journalists have to work with designers; while product managers, producers and editors try to translate between them all. It can be frustrating to figure out how to do this well and not silently stew. We’ll work through the struggles with understanding and identify how to foster better collaboration and bridge communication gaps.\n\nThough newsrooms are working on innovative new projects with these teams more than ever, it can be difficult to know how to work with people whose skills you might not understand; and even more tricky to lead those teams. \n\nThe aim is to leave this workshop with a better handle on how you can work better and more collaboratively upon your return to work.", 
            "everyone": "", 
            "facilitators": "Hannah Wise, Hannah Sung", 
            "facilitators_twitter": "hannahjwise, hannahsung", 
            "id": "bridging-gaps", 
            "length": "75 minutes", 
            "notepad": "y", 
            "room": "Thomas Swain", 
            "time": "4:15-5:30pm", 
            "timeblock": "friday-pm-2", 
            "title": "Whine & Shine: A support group for nerds, journalists and those who bridge the gap", 
            "transcription": "y"
        }
    ]
}

// let's start this thing. Runs `checkTimeMatch` every minute, triggering
// posts to all subscribed Slack teams each time a `now` moment matches
// a timestamp key in the `transcripts` object.
var CronJob = require('cron').CronJob;
new CronJob('0 * * * * *', checkTimeMatch, null, true, currentTimezone);
