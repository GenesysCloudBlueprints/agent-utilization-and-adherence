const platformClient = require('purecloud-platform-client-v2');
const { DateTime } = require('luxon');

exports.handler = async (event) => {
    try {
        const client = platformClient.ApiClient.instance;
        const usersApi = new platformClient.UsersApi();
        const workforceManagementApi = new platformClient.WorkforceManagementApi();
        const presenceApi = new platformClient.PresenceApi();

        // Login
        await client.loginClientCredentialsGrant(
            process.env.GENESYS_CLOUD_CLIENT_ID,
            process.env.GENESYS_CLOUD_CLIENT_SECRET
        );

        // Get users
        const usersData = await usersApi.getUsers({
            pageSize: 100,
            expand: ['presence','routingStatus','integrationPresence','conversationSummary','profileSkills','groups'],
            state: 'active'
        });

        const userData = usersData.entities.map(user => ({
            id: user.id,
            name: user.name,
            systemPresence: user.presence?.presenceDefinition?.systemPresence || null,
            routingStatus: user.routingStatus?.status || null,
            activeConversations: getActiveConversations(user.conversationSummary)
        }));

        const userIds = userData.map(user => user.id);

        // Get date range
        const nowSydney = DateTime.now().setZone('system');
        const startDateUTC = nowSydney.startOf('day').toUTC().toISO();
        const endDateUTC = nowSydney.endOf('day').toUTC().toISO();

        // Get schedules
        const scheduleData = await workforceManagementApi.postWorkforcemanagementManagementunitAgentschedulesSearch(
            process.env.MANAGEMENT_UNIT_ID,
            {
                startDate: startDateUTC,
                endDate: endDateUTC,
                userIds: userIds
            }
        );

        const agentSchedules = scheduleData.result.agentSchedules;
        const agentsToUpdate = [];
        const nowUTC = new Date();
        const nowPlus15 = new Date(nowUTC.getTime() + 15 * 60 * 1000);

        // Check schedules
        for (let agentSchedule of agentSchedules) {
            const userId = agentSchedule.user.id;
            const user = userData.find(u => u.id === userId);

            if (!user || user.systemPresence !== 'On Queue' || 
                (user.routingStatus !== 'IDLE' && user.routingStatus !== 'INTERACTING')) {
                continue;
            }

            const shifts = agentSchedule.shifts;
            if (!shifts) continue;

            for (let shift of shifts) {
                const activities = shift.activities;
                if (!activities) continue;

                for (let activity of activities) {
                    if (activity.activityCodeId === '1' || activity.activityCodeId === '2') {
                        const activityStart = new Date(activity.startDate);
                        
                        if (activityStart >= nowUTC && activityStart <= nowPlus15) {
                            agentsToUpdate.push({
                                id: userId,
                                presenceDefinition: {
                                    id: process.env.PRE_BREAK_PRESENCE_ID
                                },
                                source: 'PURECLOUD'
                            });
                            break;
                        }
                    }
                }
            }
        }

        // Update presence
        if (agentsToUpdate.length > 0) {
            await presenceApi.putUsersPresencesBulk(agentsToUpdate);
            console.log(`Updated ${agentsToUpdate.length} agents`);
        } else {
            console.log('No agents to update');
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Success',
                agentsUpdated: agentsToUpdate.length
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

function getActiveConversations(conversationSummary) {
    let totalActiveConversations = 0;
    if (!conversationSummary) return 0;

    for (const mediaType in conversationSummary) {
        const mediaSummary = conversationSummary[mediaType];
        if (mediaSummary.contactCenter) {
            totalActiveConversations += mediaSummary.contactCenter.active || 0;
            totalActiveConversations += mediaSummary.contactCenter.acw || 0;
        }
        if (mediaSummary.enterprise) {
            totalActiveConversations += mediaSummary.enterprise.active || 0;
            totalActiveConversations += mediaSummary.enterprise.acw || 0;
        }
    }
    return totalActiveConversations;
}