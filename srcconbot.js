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
var debug = false;

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
                'thumb_url': 'https://srccon.org/media/img/logo75.png',
                'pretext': ':speech_balloon::tada: A SRCCON 2017 session with live transcription is about to start!',
                'fallback': `A SRCCON 2017 session with live transcription is about to start: ${transcript.title}. Open the live transcript at https://aloft.nu/srccon/2017-${transcript.id}.`,
                'color': '#F79797',
                'title': transcript.title,
                'title_link': 'https://aloft.nu/srccon/2017-'+transcript.id,
                'text': transcript.description,
                'fields': [
                    {
                        'title': 'Facilitator(s)',
                        'value': transcript.facilitators,
                    },
                    {
                        'title': 'Transcript',
                        'value': `<https://aloft.nu/srccon/2017-${transcript.id}|Open the live transcript>`,
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
    [key('2017-08-03 10:00')]: [
        {
            "day": "Thursday", 
            "description": "As thoughtful and deliberate as we try to be, we’re all still human, and the overwhelming majority of us tend to seek out information that confirms what we already believe to be true. That’s a problem. As media organizations, we’re only serving a fraction of our communities if we can only reach those who already know and agree with the stories we’re sharing. So, what actually encourages people to consider perspectives that differ from their own, and how do we create more space for that?\n\nIn this session, we’ll dig in on these questions and get a little vulnerable as we try to create that space for ourselves. We’ll talk about how people come to believe what they believe, and look at the latest research around confirmation bias, the backlash effect, and other factors that shape how we make decisions and, ultimately, change our minds. In small groups, we’ll talk about areas where our perspectives have changed over time, and reflect on the forces that helped us change our point of view. We’ll surface common themes as a group and discuss ways these experiences could inform and—dare we say—change the way we approach our work.", 
            "facilitators": "Marie Connelly, B Cordelia Yu", 
            "id": "change-our-minds", 
            "length": "75 minutes", 
            "room": "Johnson", 
            "time": "10-11:15am", 
            "title": "How do we change our minds anyway?"
        }, 
        {
            "day": "Thursday", 
            "description": "Stop throwing away your shot. Using the dueling personalities of Alexander Hamilton and Aaron Burr, we’ll discuss solutions to common problems standing between you and a more productive, calm workday.\n\nLearn effective ways to get things done, improve your workflow, find better ways to collaborate and more!\n\nYou don’t need to know the Hamilton soundtrack inside out to participate, though some familiarity might make this more enjoyable. We’ll put together any story-specific information you need to know as a group and go from there.", 
            "facilitators": "Hannah Birch", 
            "id": "hamilton-or-burr", 
            "length": "75 minutes", 
            "room": "Ski-U-Mah", 
            "time": "10-11:15am", 
            "title": "Are you Hamilton or Burr? How to benignly manipulate the people around you"
        }, 
        {
            "day": "Thursday", 
            "description": "In the current political environment, news cycles are getting shorter and the amount of work that needs to be done is greater by the day. We would like to discuss practical approaches newsrooms are taking to cover American democracy in the age of Trump, from building databases to automating information changes to making life easier for on-the-ground reporters and everything in between.", 
            "facilitators": "Aaron Williams, Steven Rich", 
            "id": "practical-software-democracy", 
            "length": "75 minutes", 
            "room": "Thomas Swain", 
            "time": "10-11:15am", 
            "title": "Practical approaches for creating software to cover democracy"
        }
    ],
    [key('2017-08-03 11:45')]: [
        {
            "day": "Thursday", 
            "description": "News is competitive. Digital news, even more so. And when we're all playing in the same space of news feeds and closed captioning, text must find a way to captivate an audience. But manipulating typography has been an age-old trick of tabloid magazines and sensationalized journalism, so why have we allowed some of these tactics to leak into the realm of digital journalism? Intentional or not, our use and abuse of typography brings up everything from silly snafus, like announcing the wrong winner of Miss Universe, to deeply unethical content that can stir fear and manipulate an audience's point of view. Let's explore how we may be using and abusing type in our newsrooms, how to avoid unethical treatment of typography, and what we can do to leverage text to our advantage *and* our audience's advantage.", 
            "facilitators": "Dolly Li", 
            "id": "typography-social-video", 
            "length": "75 minutes", 
            "room": "Johnson", 
            "time": "11:45am-1pm", 
            "title": "Using and Abusing Typography: How Social Video Is Playing Games With Your Heart"
        }, 
        {
            "day": "Thursday", 
            "description": "Imagine a job where you could spend all your time pursuing new, creative projects, and get your whole office on board for every big, exciting idea you come up with. \n\nThat’s probably not your job (If it is, we envy you!). When you have an idea, you have to convince other people to embrace it. Maybe you’re trying to get buy-in on a new digital project, but your newsroom is focused on the reporting-writing-editing process. Maybe you’re trying to convince others to embrace a big idea that’s going to require lots of resources and time. Or maybe you see a way to overhaul a longstanding process to make your organization function better. In this session, we’ll create games to help us figure out ways to face the challenges of navigating digital initiatives in a small news organization.\n\nBring a work challenge you’ve been grappling with — or just bring yourself and your creativity!", 
            "facilitators": "Sara Konrad Baranowski, Andrea Suozzo", 
            "id": "navigate-roadblocks-games", 
            "length": "75 minutes", 
            "room": "Ski-U-Mah", 
            "time": "11:45am-1pm", 
            "title": "Candyland, Catan and Codenames — Oh My! Navigate Roadblocks in Small Newsrooms With Games"
        }, 
        {
            "day": "Thursday", 
            "description": "What can newsrooms learn from the process of launching a product? In this session we’ll use a WTF Just Happened Today as a case study to illustrate an example of launching an MVP product, validating product decisions, and iterating on a product. We’ll define a set of constraints through a group brainstorming session to identify a set of problems to be solved. From there, we’ll do a design brainstorm to think through products that can solve those problems, and create a hypothetical new news product worth paying for.", 
            "facilitators": "Matt Kiser, Kelsey Scherer", 
            "id": "news-products", 
            "length": "75 minutes", 
            "room": "Thomas Swain", 
            "time": "11:45am-1pm", 
            "title": "News products: How to design, launch, and iterate something worth paying for"
        }
    ],
    [key('2017-08-03 15:00')]: [
        {
            "day": "Thursday", 
            "description": "Pothole locations, property tax bills, school test scores– local data is still vital to people’s daily lives and therefore, an important part of local news coverage. However, it can many times be tough to get ahold of and to deal with, especially when your editors expect New York Times level of quality with the budget and resources of the Pawnee Journal. In this session, we invite other local data journalists and enthusiasts to discuss the difficulties in working with local data and how can we make it better. How do we deal with local governments that give you data from a dot matrix printer? What are the best strategies to take national stories and localize them, especially when data might not exist on the local level? What’s the best way to showcase a data story that will really resonate with your readers who want to know more about what’s going on in their community? We’ll also be discussing our roles in small and ever-shrinking newsrooms, like we can maximize our usefulness without becoming a service desk. Join us to come up with a game plan to make local data journalism on par quality-wise with what the national newsrooms are doing. ", 
            "facilitators": "Carla Astudillo, Erin Petenko, Steve Stirling", 
            "id": "local-data-journalism", 
            "length": "75 minutes", 
            "room": "Johnson", 
            "time": "3-4:15pm", 
            "title": "Local data journalism still matters (and we can make it better!)"
        }, 
        {
            "day": "Thursday", 
            "description": "If people come to you to find out how to troubleshoot encryption keys or choose a password manager, you’re a security trainer, even if you think you’re neither qualified nor an expert. Let’s talk about best practices for ethical and responsible skill sharing, and about strategies for helping your newsroom colleagues and sources protect private conversations.\n\nOpen News and BuzzFeed Open Lab are collaborating on a curriculum designed specifically for newsroom trainers, so we'll use that as a jumping off point for our session.", 
            "facilitators": "Amanda Hickman, Matt Perry", 
            "id": "better-security-trainers", 
            "length": "75 minutes", 
            "room": "Ski-U-Mah", 
            "time": "3-4:15pm", 
            "title": "Let's be better security trainers together"
        }, 
        {
            "day": "Thursday", 
            "description": "Distribution platforms like AMP, Facebook Instant Articles, and Apple News have changed how our organizations work. Having grown reliant on social distribution to reach new audiences, Publishers who had only ever dictated their terms of distribution had to learn to adapt their already-aging business models to walled gardens, new ways to measure reach and engagement, and work within Other People’s Priorities. Content format compatibility issues, maintaining wholly separate designs inside of early-stage platforms with low feature-sets, participation being equally opt-in and required to maintain SEO and reach, reduced ad opportunities, and gaps in analytics...it was a lot to take in. But publishers are doing more than making the best of it: they’re thriving.\n\nIn this session, we’ll look at what we’ve learned from learning to adapt. Your humble hosts will draw from their experience at The New Yorker, Pitchfork, Wired, Quartz, Hearst, Condé Nast, and Vox Media to offer a survey of the technologies and strategies publishers have created to navigate this uncharted frontier. We’ll discuss how our organizations monitor engagement, drive subscriptions and revenue, and balance our legacy systems with the needs these new platforms oblige. ", 
            "facilitators": "Matt Dennewitz, Michael Donohoe, Luigi Ray-Montanez", 
            "id": "platform-life", 
            "length": "75 minutes", 
            "room": "Thomas Swain", 
            "time": "3-4:15pm", 
            "title": "My Life In the Bush of Platforms"
        }
    ],
    [key('2017-08-03 16:45')]: [
        {
            "day": "Thursday", 
            "description": "The Panama Papers, Electionland, Documenting Hate -- in an age of shrinking newsrooms and big stories, collaboration between news organizations is key. Tools and systems that enable the many to work together -- both off-the-shelf and custom -- are a key ingredient to making that collaboration smooth. Together, we'll talk about the pros, cons, and heartaches in getting newsrooms to collaborate, and explore the possibilities through fun, group activities.", 
            "facilitators": "Alan Palazzolo, Ken Schwencke, Andre Natta", 
            "id": "newsroom-collaboration", 
            "length": "75 minutes", 
            "room": "Johnson", 
            "time": "4:45-6pm", 
            "title": "Greasing the wheels of inter-newsroom collaboration"
        }, 
        {
            "day": "Thursday", 
            "description": "We’ll start with a brainstorm of common topics, concepts, and processes that we think would benefit from explanation on interdisciplinary teams, i.e. version control, APIs, web accessibility, HTTPS, staging vs. production. Then, we’ll divide into groups and come up with any and all relevant metaphors (if time allows, we’ll even do a GIF-based brainstorm!) We’ll eventually refine and narrow down a list of useful metaphors — and none of that “explain what you do to your mom” language — the outcome of this session will be accessible and inclusive metaphors for all!", 
            "facilitators": "Nicole Zhu", 
            "id": "better-tech-metaphors", 
            "length": "75 minutes", 
            "room": "Ski-U-Mah", 
            "time": "4:45-6pm", 
            "title": "Toward better metaphors: Accessible and inclusive ways to explain technical work"
        }, 
        {
            "day": "Thursday", 
            "description": "Hackers, governmental entities, malicious ads, coffeeshop snoopers, airline Wi-fi, us-- all of these have the potential to violate the privacy of our users, our staff, and our sources. What responsibility does a newsroom have to protect these group’s privacy and personal information? How can we realistically fulfill these responsibilities? How can we assess what we have control over and what we can’t control? \n\nPrivacy in the digital world is complex and it is time for newsrooms to solidify their footing with new guidelines and tips. We want to explore multiple scenarios involving a privacy breach. The scenarios will cover behavioral, technological, and ethical issues based on real-life examples. You, the newsroom, will tackle the situation given to you. Your mission: come up with a set of guidelines on how to prevent and respond to your specific scenario.", 
            "facilitators": "Ian Carrico, Lo Benichou", 
            "id": "protect-user-privacy", 
            "length": "75 minutes", 
            "room": "Thomas Swain", 
            "time": "4:45-6pm", 
            "title": "How do we protect our users' privacy?"
        }
    ],
    [key('2017-08-04 10:00')]: [
        {
            "day": "Friday", 
            "description": "The Fluxkit, designed and assembled by George Maciunas in 1965, contained printed matter, a film, and a variety of objects including a “wood box with offset labels and rubber opening containing unknown object,” by the Fluxus artist Ay-O.  The label read: “put finger in hole.”\n\nFluxus artists were playful revolutionaries who tried to undermine the authority of the museum and the primacy of the artist.  One strategy they deployed was demanding that the viewer complete (and thereby co-create) certain pieces of art.\n\nTo many of us news nerds, “interactive” has become a noun.  But how interactive is your interactive, really?  When’s the last time you stopped to consider just how revolutionary an idea it is to include your reader in the completion (or co-creation) of your work as a journalist?\n\nIn this session, we’ll forget about our newsrooms, tools, and data sets for a while and think about the essence of interaction.  What inspires us as individuals to reach out and try to affect the world?  As part of a group?  By what means can we do so?  How might find we are changed in turn?  What invites us and what repels us?  Where do exploration and interaction diverge?\n\nThen we’ll zoom back in and ask: how can we orchestrate meaningful interactive experiences through our work?  I’ll suggest some inspiration from the art world: happenings, instruction pieces, escape rooms, live action installations; please bring some inspirations of your own.\n\nAlone and in teams, we will hammer out manifestos and instruction pieces for building digital interactives, then swap them with each other.  Take your instructions home.  Follow them.  After SRCCON, we’ll publish the raw materials and the the interactives together as new sNerdFluxkit (2017).", 
            "facilitators": "Scott Blumenthal, Britt Binler", 
            "id": "new-snerd-fluxkit", 
            "length": "75 minutes", 
            "room": "Johnson", 
            "time": "10-11:15am", 
            "title": "new sNerdFluxkit (2017): inspiration and provocations for people who make interactives"
        }, 
        {
            "day": "Friday", 
            "description": "The U.S. has become increasingly polarized and, ironically, we complain about it within our own filter bubbles. Indeed, we comfortably sympathize with the views of our political parties, influencers and friends, and ignore the banter; in fact, Fox News viewers believe the news they watch is “fair and balanced”, while CNN watchers dismiss the idea that they could possibly be consuming “fake news.” But why such polarization and how did we get here? If Brexit and the US election teach us one thing, it is that it may be time to step outside our comfort bubbles and start a conversation with the opposing view.\n\nNow suppose you land in another filter bubble full of despisers and disbelievers. How would you convince them that universal healthcare isn’t a bad idea, or that a strong dollar doesn’t translate into a strong US economy? How would you even start such a conversation? For more complicated political and economic issues, how would you help people move forward beyond face value and hearsay? If laying out facts doesn’t work, how can you approach others outside your own filter bubbles with a more accessible, heartfelt or persuasive approach?\n\nThe suggested encounter will not be easy. But filter bubbles won’t burst by themselves. It is up to us to take them on, and we are conscientious and badass enough to pull it off! ", 
            "facilitators": "Sonya Song", 
            "id": "filter-bubbles", 
            "length": "75 minutes", 
            "room": "Ski-U-Mah", 
            "time": "10-11:15am", 
            "title": "Why you are part of the filter bubble problem and what you can do about it"
        }, 
        {
            "day": "Friday", 
            "description": "When sharing ideas while interviewing for a position, you're essentially doing free consulting work if you don't get the gig. Together, let's explore better methods of testing skills through the hiring process. We'll dig into skills tests, idea proposals and more to come up with some best practices for the journalism-tech industry.", 
            "facilitators": "Rachel Schallom", 
            "id": "hiring-skills-tests", 
            "length": "75 minutes", 
            "room": "Thomas Swain", 
            "time": "10-11:15am", 
            "title": "Finding a better way to test skills while hiring"
        }
    ],
    [key('2017-08-04 11:45')]: [
        {
            "day": "Friday", 
            "description": "Happy teams know what they're trying to achieve, and what their jobs are. It's easy to define crystal-clear goals and roles, but many managers fail to do so. (Ourselves included!) Whether you're a manager or just desperate for direction, join us to talk about proven techniques for team happiness.", 
            "facilitators": "Brian Boyer, Livia Labate", 
            "id": "goals-roles", 
            "length": "75 minutes", 
            "room": "Johnson", 
            "time": "11:45am-1pm", 
            "title": "Goals and Roles: Explicit is better than implicit"
        }, 
        {
            "day": "Friday", 
            "description": "It’s surprisingly easy to end up in a teaching role without any particular training in how to teach. Whether you teach regularly or just occasionally (like leading sessions at conferences, hint, hint), come join this crash course in how we can teach to groups more effectively. We’ll take a quick look at recent trends and research in pedagogy for strategies you can use, then talk through common classroom problems such as needy and know-it-all students, questions you can’t answer off-hand, and how to deal if you don’t fit your students’ expectations about what a teacher is like.", 
            "facilitators": "Lisa Waananen Jones, Amy Kovac-Ashley", 
            "id": "teachers-lounge", 
            "length": "75 minutes", 
            "room": "Ski-U-Mah", 
            "time": "11:45am-1pm", 
            "title": "Teachers' Lounge: Talking Tips and Strategies for Effective Teaching to Groups"
        }, 
        {
            "day": "Friday", 
            "description": "Is your newsroom moving to WordPress? Moving away from WordPress? Moving to your parent company's CMS? Moving to Arc? Building a new CMS from scratch using Node? Rails? Django? (Are you using Django-CMS or Mezzanine or Wagtail?) Going headless with WordPress? Going headless with React?\n\n...or is your newsroom paralyzed by the sheer magnitude of the task of choosing and migrating to a new CMS, let along upgrading your current one?\n\nThis session is about the why and how of migrating your content to new systems. When is it time to change up your CMS, and why? When is it better to repair your ship instead of jumping off? What does the transition process look like-- for instance, how do you handle your archival stories, or make sure your frontend and backend features are in sync? How do you pull it off (technically)? How do you pull it off (organizationally)? Most importantly: was it worth it?", 
            "facilitators": "Liam Andrew, Pattie Reaves", 
            "id": "switching-cmses", 
            "length": "75 minutes", 
            "room": "Thomas Swain", 
            "time": "11:45am-1pm", 
            "title": "Switching CMSes"
        }
    ],
    [key('2017-08-04 14:30')]: [
        {
            "day": "Friday", 
            "description": "News breaks and journalists & editors scramble to react. Afterward shoulders are shrugged and we say \"Forget it, Jake. It's breaking news.\" That's how it works right?\n\nBut that's not how it needs to work. What if instead we could approach breaking news situations with a sense of calm and confidence? What if we considered the who, what, where, why and how of things that could happen, and simply left the when to chance?\n\nPut simply - let's all plan for the news that could/will happen in our market and consider a needs assessment.\n\nWhat background information and context should be at or near our fingertips? How to teach a reporting staff to know what their first \"reads\" are of a situation given their beat? What roles need to be filled first to get a handle on the news? What efficient and non-repetitive methods of managing information exist? How can we receive information from our audience? How can we convey meaningful information to our audience? And what traps exist?", 
            "facilitators": "Chris Keller, Sara Simon", 
            "id": "breaking-news-plan", 
            "length": "75 minutes", 
            "room": "Johnson", 
            "time": "2:30-3:45pm", 
            "title": "This just in... You can plan for breaking news"
        }, 
        {
            "day": "Friday", 
            "description": "Global warming is quite possibly the biggest challenge humanity is facing in our lifetime. Yet, we are having a hard time getting the message through: According to a [2016 Pew report](http://www.pewinternet.org/2016/10/04/public-views-on-climate-change-and-climate-scientists/), less than half of Americans believe that man-made global warming is real.\n\nClimate change is a complex topic but also diffuse and impersonal – hard to grasp for both the audience and us journalists. In this session, we'll work on better understanding climate change issues and on finding new, relatable ways to communicate them. We'll play a game in which we step in the shoes of climate change deniers, beneficiaries, but most importantly of those who suffer from the effects of global warming. Based on our learnings from that, we’ll come up with new ideas for communicating global warming, its reasons, and its effects on people’s lives – through graphics, interactive storytelling, or whatever else we can prototype on paper.", 
            "facilitators": "Simon Jockers, Cathy Deng", 
            "id": "climate-change-personal", 
            "length": "75 minutes", 
            "room": "Ski-U-Mah", 
            "time": "2:30-3:45pm", 
            "title": "Making climate change personal"
        }, 
        {
            "day": "Friday", 
            "description": "In what ways do you interact with datasets? How might those interactions be improved? In this workshop we'll work through a series of small-group exercises to identify:\n\n- how we find, store, analyze, and publish data right now, and how those methods fail us\n- what gets in our way of keeping data organized and reusable\n- the kinds of training team members need to work with data\n- ways we might improve our day-to-day data work\n\nBy the end of the workshop you'll have a clearer understanding of what issues you face when working with data, learned from the experiences of other participants, and started a plan for improving how your newsroom works with data. ", 
            "facilitators": "Seth Vincent", 
            "id": "working-with-data", 
            "length": "75 minutes", 
            "room": "Thomas Swain", 
            "time": "2:30-3:45pm", 
            "title": "Working with data: Where was that spreadsheet? Wait, why has it changed?"
        }
    ],
    [key('2017-08-04 16:15')]: [
        {
            "day": "Friday", 
            "description": "While it would be amazing for journalists to be spread across America, the big media companies are parked mostly in NYC and DC. This means we analyze data from afar and write anecdotal trend pieces without much understanding of the vast and diverse local populations that might be impacted or influencing some topic. Fear not! There are bunches of motivated and stoked people at the local level that want to find, process, and provide information to the public to help them be more informed. These civic hacktivists share an ethos with journalists. We should look to connect with local Code for America brigades to get more context at the local level until we actually achieve better geographic diversity in media.\n\nDave and Ernie help connect hackers and activists with their local governments to find ways to make government work better for the people. Come and discuss tactics for connecting with local brigades to find data and better understand local issues, local people and local governments… since we know y’all don’t have people living there.", 
            "facilitators": "Dave Stanton, Ernie Hsiung", 
            "id": "code-across-america", 
            "length": "75 minutes", 
            "room": "Ski-U-Mah", 
            "time": "4:15-5:30pm", 
            "title": "Code Across America: Working with local Code for America brigades to find local stories"
        }, 
        {
            "day": "Friday", 
            "description": "It was a great idea. You worked really hard to bring it into this world, watched it grow and blossom. It had its moment in the sun, but now it's starting to slow down. Show its age. It's having a hard time keeping up, to be completely honest. Maybe you've even already moved on. How do you say goodbye? What does end of life care look like for news/tech projects? How do you manage successful transitions and handoffs? In this session we'll talk about about the hard decisions you sometimes have to make, how to prepare for these situations and how to make sure your projects (or at least the lessons learned) live on.", 
            "facilitators": "Adam Schweigert, Ted Han", 
            "id": "death-of-a-project", 
            "length": "75 minutes", 
            "room": "Thomas Swain", 
            "time": "4:15-5:30pm", 
            "title": "Let's Talk About Death "
        }
    ]
}

// let's start this thing. Runs `checkTimeMatch` every minute, triggering
// posts to all subscribed Slack teams each time a `now` moment matches
// a timestamp key in the `transcripts` object.
var CronJob = require('cron').CronJob;
new CronJob('0 * * * * *', checkTimeMatch, null, true, currentTimezone);
