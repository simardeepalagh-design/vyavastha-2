import React, { createContext, useState, useEffect } from 'react';
import { supabase } from '../supabase';

export const ProjectContext = createContext();

export const ProjectProvider = ({ user, children }) => {
  const [currentProject, setCurrentProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const fetchProjects = async () => {
    if (!user?.id) {
      setProjects([]);
      setCurrentProject(null);
      return;
    }
    
    setProjectsLoading(true);
    
    try {
      // If admin, fetch their projects. If manager, fetch their admin's projects.
      const queryAdminId = user.role === 'admin' ? user.id : user.admin_id;
      
      if (!queryAdminId) {
        setProjects([]);
        setProjectsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('admin_id', queryAdminId);
        
      if (!error && data) {
        setProjects(data);
        
        // Manager lock logic
        if (user.role === 'manager' && user.project_id) {
          const assignedProject = data.find(p => p.id === user.project_id);
          if (assignedProject) {
            setCurrentProject(assignedProject);
          }
        } else if (data.length > 0 && !currentProject) {
          setCurrentProject(data[0]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch projects:', e);
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [user]);

  return (
    <ProjectContext.Provider value={{ 
      currentProject, 
      setCurrentProject, 
      projects,
      projectsLoading,
      fetchProjects 
    }}>
      {children}
    </ProjectContext.Provider>
  );
};
